//! c4n-zellij-adapter — spawn / supervise Zellij sessions.
//!
//! Architecture: D-2 (Zellij is the sole spawn path; owns session persistence).
//! Implementing stories: M1 Story 1.11 (this) + M2 Story 2.4 (multi-pane) +
//! M3 Story 3.3 (dynamic-persona panes).
//!
//! ## Architectural role
//!
//! Every persistent persona's process (Dev / Frontend Designer / dynamic
//! Architect / etc.) runs inside a Zellij pane. The pane gives us:
//!
//!   - **Restart survival** — the Zellij server outlives the desktop app's
//!     lifetime; closing the workspace doesn't kill the persona's CLI process.
//!     Reopening the app re-attaches.
//!   - **Single attachment point** — the user can attach via `zellij attach`
//!     from their own terminal even when the desktop UI is closed.
//!   - **Process supervision** — Zellij tracks the child's exit; if it crashes
//!     we can detect and offer to relaunch.
//!
//! ## Scope (M1)
//!
//! Story 1.11 ships:
//!   - `is_available()` — `zellij --version` probe.
//!   - `spawn_pane(config)` — start (or reuse) a named session, open a pane
//!     running the given command in it.
//!   - `PaneHandle` returned by `spawn_pane` — exposes session metadata and
//!     `kill()` / `session_exists()` / `list_sessions()`.
//!
//! Multi-pane (M2 Story 2.4) and persona-supervisor stdout/stderr capture
//! (M1 Story 1.14 + M2 Story 2.16 telemetry tap) layer on top.
//!
//! ## Zellij prerequisite
//!
//! Zellij ≥ 0.44.0 must be installed and on PATH. v0.44.0 introduced native
//! Windows support via ConPTY; older versions are Linux/macOS only. The pin
//! lives in `docs/pinned-versions.md` (currently v0.44.3).
//!
//! Install:
//!   - Windows: `winget install zellij-org.zellij` OR `cargo install zellij --locked --version 0.44.3`
//!   - macOS:   `brew install zellij`
//!   - Linux:   `cargo install zellij --locked --version 0.44.3` OR distro pkg

use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Command;
use thiserror::Error;
use tracing::{debug, warn};

mod multi_pane;
pub use multi_pane::{
    MultiPaneSession, Pane, PersonaPaneSpec, SessionSnapshot, MAX_PANES_PER_SESSION,
};

/// Errors the adapter can produce. Serializable so they cross the Tauri IPC
/// boundary cleanly if callers want to surface them in the UI.
#[derive(Debug, Error, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum ZellijError {
    /// Zellij isn't on PATH. The wizard / setup flow should prompt the user
    /// to install per the docstring at the top of this module.
    #[error("zellij not installed or not on PATH")]
    NotInstalled,

    /// Zellij returned a non-zero exit code. Stderr captured.
    #[error("zellij command failed (exit {exit_code}): {stderr}")]
    CommandFailed {
        cmd: String,
        exit_code: i32,
        stderr: String,
    },

    /// std::process I/O error (couldn't even invoke zellij).
    #[error("io: {0}")]
    Io(String),

    /// Multi-pane (Story 2.4): adding another pane would exceed the
    /// session's configured cap.
    #[error("session '{session}' is at its pane cap ({max}); cannot add more")]
    TooManyPanes { session: String, max: usize },

    /// Multi-pane (Story 2.4): a pane is already tracked for this persona
    /// in the session. Persona IDs are the per-pane routing label and must
    /// be unique within a session.
    #[error("session '{session}' already has a pane for persona '{persona_id}'")]
    DuplicatePersona { session: String, persona_id: String },

    /// Multi-pane (Story 2.4): tried to reattach to a session that no
    /// longer exists (the Zellij server for it is gone).
    #[error("zellij session '{session}' not found (cannot reattach)")]
    SessionNotFound { session: String },
}

impl From<std::io::Error> for ZellijError {
    fn from(err: std::io::Error) -> Self {
        if err.kind() == std::io::ErrorKind::NotFound {
            ZellijError::NotInstalled
        } else {
            ZellijError::Io(err.to_string())
        }
    }
}

pub type Result<T> = std::result::Result<T, ZellijError>;

/// Config for spawning a Zellij pane.
#[derive(Debug, Clone)]
pub struct SpawnPaneConfig {
    /// Session name. If a session with this name already exists, the new
    /// pane is added to it; otherwise a fresh session is created.
    pub session_name: String,

    /// Command to run inside the pane (e.g. `"claude"`, `"agy"`).
    pub command: String,

    /// Args passed to the command.
    pub args: Vec<String>,

    /// Extra environment variables for the spawned process. Inherits the
    /// parent's env, then layers these on top.
    pub env: HashMap<String, String>,

    /// Working directory the command runs in.
    pub cwd: Option<PathBuf>,

    /// Optional human-readable pane name shown in the Zellij UI.
    pub pane_name: Option<String>,

    /// If true, the pane is closed when the command exits. If false, the pane
    /// stays open with the command's last output visible.
    pub close_on_exit: bool,
}

/// Handle returned by `spawn_pane`. Identifies the session + pane the caller
/// just created. Use this for follow-up operations (kill, query existence).
#[derive(Debug, Clone)]
pub struct PaneHandle {
    pub session_name: String,
    pub pane_name: Option<String>,
}

impl PaneHandle {
    /// Returns true if the session named by this handle is still alive.
    pub fn session_exists(&self) -> Result<bool> {
        Ok(list_sessions()?
            .iter()
            .any(|s| session_name_matches(s, &self.session_name)))
    }

    /// Kill the entire Zellij session this pane lives in. Stops every pane
    /// (including any others added later) and the Zellij server for that
    /// session.
    pub fn kill(&self) -> Result<()> {
        let output = Command::new("zellij")
            .args(["delete-session", &self.session_name, "--force"])
            .output()?;
        if !output.status.success() {
            return Err(ZellijError::CommandFailed {
                cmd: format!("zellij delete-session {} --force", self.session_name),
                exit_code: output.status.code().unwrap_or(-1),
                stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
            });
        }
        Ok(())
    }
}

/// Returns true if the `zellij` binary is on PATH and executes.
pub fn is_available() -> bool {
    Command::new("zellij")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Returns the Zellij version string (e.g. "zellij 0.44.3") or an error.
pub fn version() -> Result<String> {
    let output = Command::new("zellij").arg("--version").output()?;
    if !output.status.success() {
        return Err(ZellijError::CommandFailed {
            cmd: "zellij --version".to_string(),
            exit_code: output.status.code().unwrap_or(-1),
            stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
        });
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// List the currently-active Zellij sessions (each entry typically looks
/// like "session-name [Created Nm Hs ago]"). Returns an empty vec if no
/// sessions are active.
pub fn list_sessions() -> Result<Vec<String>> {
    let output = Command::new("zellij").arg("list-sessions").output()?;
    // `zellij list-sessions` exits non-zero (1) when no sessions exist; treat
    // that case as "empty list" rather than an error.
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("No active") || stderr.is_empty() {
            return Ok(Vec::new());
        }
        return Err(ZellijError::CommandFailed {
            cmd: "zellij list-sessions".to_string(),
            exit_code: output.status.code().unwrap_or(-1),
            stderr: stderr.into_owned(),
        });
    }
    Ok(String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| line.to_string())
        .collect())
}

/// Spawn a pane running the given command in a new or existing Zellij session.
///
/// Implementation: invokes `zellij --session <name> action new-pane`
/// (which creates the session on-demand if needed). The session runs detached
/// — the user can attach later via `zellij attach <name>` from any terminal
/// (or via the embedded multi-terminal view in the Tauri shell once Story 1.16
/// lands).
///
/// **Windows note (per brief §9 risk):** Zellij v0.44.0 added native Windows
/// support via ConPTY. v0.44.3 has additional Windows Terminal mouse-event
/// fixes. If pane spawn surfaces Windows-specific issues at integration time,
/// log them as a `[NOTE FOR PM]` against this story and revisit at M1 mid-review.
pub fn spawn_pane(config: SpawnPaneConfig) -> Result<PaneHandle> {
    debug!(
        session = %config.session_name,
        command = %config.command,
        args = ?config.args,
        "spawning Zellij pane"
    );

    let mut cmd = Command::new("zellij");
    cmd.args(["--session", &config.session_name])
        .arg("action")
        .arg("new-pane");

    if config.close_on_exit {
        cmd.arg("--close-on-exit");
    }
    if let Some(name) = &config.pane_name {
        cmd.args(["--name", name]);
    }
    if let Some(cwd) = &config.cwd {
        cmd.arg("--cwd").arg(cwd);
    }

    // Everything after `--` is the command + args to run in the pane.
    cmd.arg("--").arg(&config.command).args(&config.args);

    for (k, v) in &config.env {
        cmd.env(k, v);
    }

    let output = cmd.output()?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
        warn!(
            session = %config.session_name,
            stderr = %stderr,
            "zellij action new-pane failed"
        );
        return Err(ZellijError::CommandFailed {
            cmd: format!(
                "zellij --session {} action new-pane -- {} {:?}",
                config.session_name, config.command, config.args
            ),
            exit_code: output.status.code().unwrap_or(-1),
            stderr,
        });
    }

    Ok(PaneHandle {
        session_name: config.session_name,
        pane_name: config.pane_name,
    })
}

/// Returns the crate's identity string. Used by tests and presence checks.
pub fn package_name() -> &'static str {
    "c4n-zellij-adapter"
}

/// `zellij list-sessions` output format varies slightly across versions and
/// includes ANSI color codes plus "[Created N ago]" suffix. This helper just
/// checks whether the line contains the bare session name as a token.
pub(crate) fn session_name_matches(line: &str, name: &str) -> bool {
    // Strip ANSI escapes naively, then look for the name as the first token.
    let stripped: String = line
        .chars()
        .filter(|&c| c.is_ascii_graphic() || c == ' ')
        .collect();
    stripped
        .split_whitespace()
        .next()
        .map(|first| first == name)
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn package_name_is_correct() {
        assert_eq!(package_name(), "c4n-zellij-adapter");
    }

    #[test]
    fn session_name_matcher_handles_typical_format() {
        assert!(session_name_matches(
            "dev-c4n [Created 2h 13m ago]",
            "dev-c4n"
        ));
        assert!(!session_name_matches(
            "dev-c4n [Created 2h 13m ago]",
            "frontend-designer"
        ));
        assert!(session_name_matches("dev-c4n", "dev-c4n"));
    }

    /// Integration test — verifies spawn_pane works against a real Zellij
    /// install on the dev machine. Skips cleanly when Zellij isn't available
    /// (CI runners don't have it by default; the wizard / setup flow ensures
    /// it on actual user machines).
    ///
    /// Run explicitly with: `cargo test -p c4n-zellij-adapter -- --ignored`
    #[test]
    #[ignore = "needs zellij ≥ 0.44 installed; CI runners don't have it"]
    fn spawn_and_kill_roundtrip() {
        if !is_available() {
            eprintln!("zellij not installed — skipping integration test");
            return;
        }

        let session = format!("c4n-adapter-test-{}", std::process::id());
        let config = SpawnPaneConfig {
            session_name: session.clone(),
            // Use a quick-exit command so the pane is cheap to clean up.
            command: if cfg!(windows) { "cmd" } else { "true" }.to_string(),
            args: if cfg!(windows) {
                vec!["/C".into(), "exit".into()]
            } else {
                vec![]
            },
            env: HashMap::new(),
            cwd: None,
            pane_name: Some("test-pane".to_string()),
            close_on_exit: true,
        };

        let handle = spawn_pane(config).expect("spawn_pane should succeed");
        assert_eq!(handle.session_name, session);

        // Session should exist briefly.
        let exists = handle
            .session_exists()
            .expect("session_exists query should succeed");
        assert!(exists, "session must exist immediately after spawn");

        // Cleanup.
        handle.kill().expect("kill should succeed");
    }
}
