//! Tauri synchronous-call surface (D-1).
//!
//! Each function annotated with `#[tauri::command]` becomes invokable
//! from the front-end via `invoke('name', args)`. Long-lived streams
//! live in `crate::ipc` instead.

use c4n_platform_fs as platform_fs;
use c4n_zellij_adapter::{self as zellij, SpawnPaneConfig};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex as StdMutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::ipc::Channel;
use tauri::State;

/// Bundled Dev-persona markdown, sourced from `@c4n/persona-sync` so the
/// single canonical definition lives in the workspace package. Embedded
/// at compile time — no runtime FS lookup needed for the default.
/// (Story 1.13.)
const BUNDLED_DEV_PERSONA_MD: &str =
    include_str!("../../../../../packages/persona-sync/src/personas/dev.md");

/// Bundled Frontend Designer persona markdown. Same single-source pattern
/// as the Dev persona. (Story 2.3.)
const BUNDLED_DESIGNER_PERSONA_MD: &str =
    include_str!("../../../../../packages/persona-sync/src/personas/designer.md");

/// BMAD customize-chain override path. If a user-project contains this
/// file, we project its contents instead of the bundled default.
const PROJECT_DEV_OVERRIDE_RELPATH: &str = "_bmad/custom/agents/dev.md";

/// Filename written to the project root. Claude Code reads it on launch.
const CLAUDE_MD_FILENAME: &str = "claude.md";

/// Default binary name for the persona-supervisor (Story 1.14b). Resolves
/// through PATH at spawn time. Production installer puts the binary on
/// PATH; for `cargo run` development, run
/// `cargo install --path crates/persona-supervisor --debug` once.
/// Override via `C4N_PERSONA_SUPERVISOR` env var if a non-standard
/// install location is needed.
const SUPERVISOR_BIN_DEFAULT: &str = "c4n-persona-supervisor";

/// Env var that overrides the supervisor binary path. Used for tests
/// and non-standard installs.
const SUPERVISOR_BIN_ENV: &str = "C4N_PERSONA_SUPERVISOR";

#[tauri::command]
pub fn ping() -> &'static str {
    "pong"
}

// ────────────────────────────────────────────────────────────────────
// Story 1.12 — project state
// ────────────────────────────────────────────────────────────────────
//
// One active project at a time. The current project pointer + metadata
// lives in `~/.4nevercompanyos/active-project.toml`. The desktop shell
// reads it on launch (and after `open_project` / `close_active_project`
// calls) to decide whether to show "no project open" UI vs the project
// chrome. Per-project state under `vault/projects/<id>/` is the
// long-lived store; this file is just the global "what's active" pointer.

/// Stable per-project identity. Derived from the project's absolute path
/// so it survives restarts and matches the same project across sessions.
/// Format: `<slugified-basename>-<8-hex-chars>` (e.g.
/// `paperclip-fork-3a7f9c11`). The hex suffix is the first 8 chars of a
/// non-cryptographic stable hash of the absolute path lowercased — enough
/// entropy to disambiguate two projects sharing a basename, no crypto deps.
fn project_id_from_path(path: &Path) -> String {
    use std::hash::{Hash, Hasher};
    // FNV-1a: a deterministic, seed-free hash so the ID is stable across
    // runs and machines. (`std::DefaultHasher` uses a per-process-random
    // SipHash seed and is intentionally NOT stable here.)
    struct Fnv1a(u64);
    impl Hasher for Fnv1a {
        fn finish(&self) -> u64 {
            self.0
        }
        fn write(&mut self, bytes: &[u8]) {
            for &b in bytes {
                self.0 ^= b as u64;
                self.0 = self.0.wrapping_mul(0x100000001b3);
            }
        }
    }
    let mut hasher = Fnv1a(0xcbf29ce484222325);
    path.to_string_lossy().to_lowercase().hash(&mut hasher);
    let suffix = format!("{:016x}", hasher.finish());

    let basename = path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("project")
        .to_lowercase();

    let slug: String = basename
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '-'
            }
        })
        .collect();

    // Collapse runs of `-` so the slug stays readable.
    let mut clean = String::with_capacity(slug.len());
    let mut prev_dash = false;
    for c in slug.chars() {
        if c == '-' {
            if !prev_dash {
                clean.push(c);
            }
            prev_dash = true;
        } else {
            clean.push(c);
            prev_dash = false;
        }
    }
    let trimmed = clean.trim_matches('-');
    let slug = if trimmed.is_empty() {
        "project"
    } else {
        trimmed
    };

    format!("{slug}-{}", &suffix[..8])
}

/// Public-facing project info returned to the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectInfo {
    /// Stable ID derived from the absolute path. Used as the Zellij
    /// session-name suffix and as the per-project vault subdirectory.
    pub id: String,
    /// Absolute filesystem path the user selected.
    pub path: String,
    /// Human-readable name (the directory basename).
    pub name: String,
    /// Unix seconds at the moment `open_project` was called.
    pub opened_at: u64,
}

fn active_project_file() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or_else(|| "home directory not found".to_string())?;
    Ok(home.join(".4nevercompanyos").join("active-project.toml"))
}

fn read_active_project() -> Result<Option<ProjectInfo>, String> {
    let path = active_project_file()?;
    if !path.exists() {
        return Ok(None);
    }
    let raw =
        std::fs::read_to_string(&path).map_err(|e| format!("read active-project.toml: {e}"))?;
    let info: ProjectInfo =
        toml::from_str(&raw).map_err(|e| format!("parse active-project.toml: {e}"))?;
    Ok(Some(info))
}

fn write_active_project(info: &ProjectInfo) -> Result<(), String> {
    let path = active_project_file()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("mkdir config: {e}"))?;
    }
    let body = toml::to_string_pretty(info).map_err(|e| format!("serialize: {e}"))?;
    std::fs::write(&path, body).map_err(|e| format!("write: {e}"))?;
    Ok(())
}

/// Mark the directory at `path` as the active project. Persists to
/// `~/.4nevercompanyos/active-project.toml` and returns the canonical
/// `ProjectInfo` (with derived ID).
///
/// Validation:
///   - path must exist
///   - path must be a directory (not a file)
///
/// This does NOT scaffold `vault/projects/<id>/` — that lands when the
/// vault layer (Story 1.6 + `@c4n/vault-layout`) gets wired into the
/// desktop. For Story 1.12a we just establish the active-project pointer.
#[tauri::command]
pub fn open_project(path: String) -> Result<ProjectInfo, String> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err(format!("path does not exist: {path}"));
    }
    if !p.is_dir() {
        return Err(format!("not a directory: {path}"));
    }
    let canon = std::fs::canonicalize(&p).map_err(|e| format!("canonicalize {path}: {e}"))?;

    let name = canon
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("project")
        .to_string();
    let id = project_id_from_path(&canon);
    let opened_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let info = ProjectInfo {
        id,
        path: canon.to_string_lossy().to_string(),
        name,
        opened_at,
    };
    write_active_project(&info)?;
    Ok(info)
}

/// Return the active project pointer, or `null` if none is open.
#[tauri::command]
pub fn current_project() -> Result<Option<ProjectInfo>, String> {
    read_active_project()
}

/// Clear the active-project pointer. Does NOT kill any spawned personas
/// for the project — call `dev_persona_status` then `kill` separately if
/// the caller wants to tear them down too. (Per D-2: Zellij sessions
/// outlive the desktop app intentionally, for restart-survival.)
#[tauri::command]
pub fn close_active_project() -> Result<(), String> {
    let path = active_project_file()?;
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| format!("remove active-project.toml: {e}"))?;
    }
    Ok(())
}

// ────────────────────────────────────────────────────────────────────
// Story 1.12 — Dev persona spawn
// ────────────────────────────────────────────────────────────────────

/// Status of a Dev persona spawn for a given project.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "state", rename_all = "kebab-case")]
pub enum DevPersonaStatus {
    /// Zellij isn't on PATH. The user needs to install it; the spawn flow
    /// surfaces an install hint.
    ZellijMissing,
    /// Zellij is present but no `dev-<project-id>` session is running.
    NotRunning { session_name: String },
    /// A `dev-<project-id>` session is running.
    Running { session_name: String },
}

fn dev_session_name(project_id: &str) -> String {
    format!("dev-{project_id}")
}

/// Cheap probe: is `zellij` on PATH?
#[tauri::command]
pub fn zellij_available() -> bool {
    zellij::is_available()
}

/// Query whether the Dev persona for the given project is currently
/// running in a Zellij pane.
#[tauri::command]
pub fn dev_persona_status(project_id: String) -> Result<DevPersonaStatus, String> {
    if !zellij::is_available() {
        return Ok(DevPersonaStatus::ZellijMissing);
    }
    let session_name = dev_session_name(&project_id);
    let sessions = zellij::list_sessions().map_err(|e| format!("list sessions: {e}"))?;
    let running = sessions
        .iter()
        .any(|line| line.split_whitespace().next() == Some(session_name.as_str()));
    Ok(if running {
        DevPersonaStatus::Running { session_name }
    } else {
        DevPersonaStatus::NotRunning { session_name }
    })
}

/// Spawn the Dev persona (Claude Code) into a Zellij pane named
/// `dev-<project-id>`. Reuses the session if it already exists.
///
/// Per Story 1.13, this also projects the Dev persona markdown into
/// `<project>/claude.md` before the spawn so Claude Code adopts the
/// right behavior on its first turn. Projection happens on every spawn
/// — drift detection between an externally-edited claude.md and the
/// canonical persona lands in Epic 3 Story 3.4.
///
/// Returns the resulting status so the UI can render the same shape it
/// gets from `dev_persona_status` polling.
///
/// AC source: Story 1.12 — within 5s the Dev persona is running in a
/// Zellij pane with Claude Code's prompt ready for input.
#[tauri::command]
pub fn spawn_dev_persona(project_id: String) -> Result<DevPersonaStatus, String> {
    if !zellij::is_available() {
        return Ok(DevPersonaStatus::ZellijMissing);
    }

    // Look up the project so we know what cwd to spawn `claude` in.
    let project = read_active_project()?
        .ok_or_else(|| "no active project — call open_project first".to_string())?;
    if project.id != project_id {
        return Err(format!(
            "project_id {project_id} doesn't match active project {}",
            project.id
        ));
    }

    // Story 1.13: project claude.md before the spawn so Claude Code reads
    // the right persona on its first turn. If projection fails we surface
    // the error and DON'T spawn — running a Dev persona without its
    // persona file produces undefined behavior.
    project_claude_md_inner(Path::new(&project.path))?;

    let session_name = dev_session_name(&project.id);

    // If the session already exists, do nothing — return Running. (Zellij
    // would still accept the call and add a new pane, but for Story 1.12a
    // we want one pane per project; multi-pane comes in M2 Story 2.4.)
    let sessions = zellij::list_sessions().map_err(|e| format!("list sessions: {e}"))?;
    let already_running = sessions
        .iter()
        .any(|line| line.split_whitespace().next() == Some(session_name.as_str()));
    if already_running {
        return Ok(DevPersonaStatus::Running { session_name });
    }

    // Story 1.14b: route the Claude Code process through the
    // persona-supervisor so stdout/stderr land in
    // <vault>/personas/dev/log/YYYY-MM-DD.jsonl. The supervisor exec-
    // wraps claude and forwards lines unchanged to its own stdio, so
    // Zellij's pane display stays identical to spawning claude directly.
    let workspace_config = read_workspace_config()?;
    let supervisor_bin = find_supervisor_binary();

    let cwd = PathBuf::from(&project.path);
    let config = SpawnPaneConfig {
        session_name: session_name.clone(),
        command: supervisor_bin,
        args: vec![
            "dev".to_string(),
            workspace_config.vault_path,
            "--".to_string(),
            "claude".to_string(),
        ],
        env: HashMap::new(),
        cwd: Some(cwd),
        pane_name: Some(format!("Dev · {}", project.name)),
        close_on_exit: false,
    };

    zellij::spawn_pane(config).map_err(|e| format!("spawn pane: {e}"))?;

    Ok(DevPersonaStatus::Running { session_name })
}

// ────────────────────────────────────────────────────────────────────
// Story 1.14b — workspace config + supervisor binary lookup
// ────────────────────────────────────────────────────────────────────

/// Workspace-level config written by the first-run wizard at
/// `~/.4nevercompanyos/config.toml`. Read by spawn_dev_persona to know
/// where the vault lives so the supervisor can write logs into it.
///
/// Schema mirrors `apps/wizard/src-tauri/src/commands.rs::WorkspaceConfig`
/// — they should stay in sync. (Future story: extract to a shared crate
/// once a third consumer materializes.)
#[derive(Debug, Deserialize, Serialize)]
struct WorkspaceConfig {
    /// Absolute vault path picked in the wizard's vault step.
    vault_path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    anthropic_authenticated: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    claude_code_authenticated: Option<bool>,
}

fn workspace_config_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or_else(|| "home directory not found".to_string())?;
    Ok(home.join(".4nevercompanyos").join("config.toml"))
}

/// Read the workspace config. Returns a clear error pointing at the
/// wizard if the config doesn't exist yet (first-run hasn't happened).
fn read_workspace_config() -> Result<WorkspaceConfig, String> {
    let path = workspace_config_path()?;
    if !path.exists() {
        return Err(
            "workspace config not found at ~/.4nevercompanyos/config.toml — please run the first-run wizard before opening a project"
                .to_string(),
        );
    }
    let raw = std::fs::read_to_string(&path).map_err(|e| format!("read workspace config: {e}"))?;
    toml::from_str(&raw).map_err(|e| format!("parse workspace config: {e}"))
}

/// Return the binary name (or path) to use when invoking the
/// persona-supervisor. Honors the `C4N_PERSONA_SUPERVISOR` env override
/// (useful for tests and non-standard installs); otherwise returns the
/// bare binary name for PATH resolution at spawn time.
fn find_supervisor_binary() -> String {
    std::env::var(SUPERVISOR_BIN_ENV).unwrap_or_else(|_| SUPERVISOR_BIN_DEFAULT.to_string())
}

// ────────────────────────────────────────────────────────────────────
// Story 1.13 — claude.md projection from the Dev persona source
// ────────────────────────────────────────────────────────────────────

/// Where the resolved Dev persona markdown came from. Surfaced to the
/// frontend so a future Settings → Personas panel can show which source
/// is active.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum PersonaSource {
    /// The bundled-default `dev.md` shipped inside the desktop binary.
    Bundled,
    /// A project-level override at `<project>/_bmad/custom/agents/dev.md`.
    ProjectOverride,
}

#[derive(Debug, Clone, Serialize)]
pub struct ClaudeMdProjection {
    /// Where the content came from (bundled vs project override).
    pub source: PersonaSource,
    /// Absolute path that was written.
    pub written_to: String,
    /// Byte length of what was written. Useful for the UI to confirm
    /// the projection produced non-empty content.
    pub bytes_written: usize,
}

/// Internal: resolve + write claude.md for the given project root. Used
/// by `spawn_dev_persona` (no need to make the frontend call this
/// separately) and by the public `project_claude_md` command (for
/// "re-project without spawning" flows in M2+).
fn project_claude_md_inner(project_root: &Path) -> Result<ClaudeMdProjection, String> {
    let (content, source) = resolve_dev_persona_content(project_root)?;
    let target = project_root.join(CLAUDE_MD_FILENAME);

    // Overwrite per AC. Drift detection lives in Story 3.4.
    std::fs::write(&target, &content).map_err(|e| format!("write {}: {e}", target.display()))?;

    Ok(ClaudeMdProjection {
        source,
        written_to: target.to_string_lossy().to_string(),
        bytes_written: content.len(),
    })
}

/// Resolve the Dev persona content to project. BMAD customize-chain
/// semantics: a project-level override wins over the bundled default.
///
/// Future stories may extend this to also read the BMAD module-level
/// `_bmad/bmm/4-implementation/bmad-agent-dev/SKILL.md` if BMAD 6.7
/// materializes that file. For 1.13 we only check the custom-override
/// path because BMAD 6.7 lazy-loads skills and SKILL.md is typically
/// absent in fresh installs.
fn resolve_dev_persona_content(project_root: &Path) -> Result<(String, PersonaSource), String> {
    let override_path = project_root.join(PROJECT_DEV_OVERRIDE_RELPATH);
    if override_path.exists() {
        let content = std::fs::read_to_string(&override_path)
            .map_err(|e| format!("read {}: {e}", override_path.display()))?;
        return Ok((content, PersonaSource::ProjectOverride));
    }
    Ok((BUNDLED_DEV_PERSONA_MD.to_string(), PersonaSource::Bundled))
}

/// Project the Dev persona markdown into `<project>/claude.md` without
/// spawning. Useful for "I edited the override — refresh" flows in M2+
/// and for the Settings → Personas panel preview.
///
/// AC source: Story 1.13. Spawn (Story 1.12) calls the same projection
/// path under the hood — the two commands are convergent.
#[tauri::command]
pub fn project_claude_md(project_path: String) -> Result<ClaudeMdProjection, String> {
    let p = PathBuf::from(&project_path);
    if !p.exists() {
        return Err(format!("path does not exist: {project_path}"));
    }
    if !p.is_dir() {
        return Err(format!("not a directory: {project_path}"));
    }
    project_claude_md_inner(&p)
}

// ────────────────────────────────────────────────────────────────────
// Story 1.16b — Hermes spawn
// ────────────────────────────────────────────────────────────────────
//
// Mirrors the Dev persona spawn pattern. Hermes lives alongside Dev as
// a second Zellij session (`hermes-<project-id>`) running through the
// same supervisor (now PTY-wrapped per 1.16a). The user sees both
// personas via the side-rail navigation in the desktop UI (ProjectsView
// for Dev, MemoryView for Hermes — that's 1.16c's job).
//
// Restart survival: same five-link chain as Dev (see docs/restart-
// survival.md). Zellij owns the session; supervisor + hermes survive
// desktop restart; session-reuse branch avoids duplicate spawn on
// relaunch.

/// Default binary name for Hermes. Hermes is Python (per architecture
/// §3.5); the user installs it via the wizard at first-run, putting
/// `hermes` on PATH. Override via `C4N_HERMES_BIN` env var for tests
/// or non-standard installs.
const HERMES_BIN_DEFAULT: &str = "hermes";

/// Env var that overrides the Hermes binary path.
const HERMES_BIN_ENV: &str = "C4N_HERMES_BIN";

/// Status of the Hermes session for a given project. Shape mirrors
/// `DevPersonaStatus` so the frontend (Story 1.16c) can render both
/// with the same status-panel component.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "state", rename_all = "kebab-case")]
pub enum HermesStatus {
    /// Zellij isn't on PATH. Same install hint as DevPersonaStatus.
    ZellijMissing,
    /// Zellij is present but no `hermes-<project-id>` session is running.
    NotRunning { session_name: String },
    /// A `hermes-<project-id>` session is running.
    Running { session_name: String },
}

fn hermes_session_name(project_id: &str) -> String {
    format!("hermes-{project_id}")
}

/// Return the binary name (or path) for Hermes. Honors `C4N_HERMES_BIN`
/// env override (useful for tests + non-standard installs); otherwise
/// returns the bare binary name for PATH resolution at spawn time.
fn find_hermes_binary() -> String {
    std::env::var(HERMES_BIN_ENV).unwrap_or_else(|_| HERMES_BIN_DEFAULT.to_string())
}

/// Query whether Hermes for the given project is currently running in
/// a Zellij pane.
#[tauri::command]
pub fn hermes_status(project_id: String) -> Result<HermesStatus, String> {
    if !zellij::is_available() {
        return Ok(HermesStatus::ZellijMissing);
    }
    let session_name = hermes_session_name(&project_id);
    let sessions = zellij::list_sessions().map_err(|e| format!("list sessions: {e}"))?;
    let running = sessions
        .iter()
        .any(|line| line.split_whitespace().next() == Some(session_name.as_str()));
    Ok(if running {
        HermesStatus::Running { session_name }
    } else {
        HermesStatus::NotRunning { session_name }
    })
}

/// Spawn Hermes into a Zellij pane named `hermes-<project-id>`. Reuses
/// the session if it already exists. Routes through the persona-
/// supervisor (Story 1.16a) so stdout/stderr land in
/// `<vault>/personas/hermes/log/<date>.{jsonl,pty.raw}`.
///
/// AC source: Story 1.16 — Hermes runs in a Zellij pane labeled
/// "Hermes" and behaves identically to running standalone.
#[tauri::command]
pub fn spawn_hermes(project_id: String) -> Result<HermesStatus, String> {
    if !zellij::is_available() {
        return Ok(HermesStatus::ZellijMissing);
    }

    // Look up the project so we know what cwd to spawn Hermes in.
    let project = read_active_project()?
        .ok_or_else(|| "no active project — call open_project first".to_string())?;
    if project.id != project_id {
        return Err(format!(
            "project_id {project_id} doesn't match active project {}",
            project.id
        ));
    }

    let session_name = hermes_session_name(&project.id);

    // Session-reuse: if Hermes is already running for this project,
    // return Running without re-spawning. Same pattern as Dev.
    let sessions = zellij::list_sessions().map_err(|e| format!("list sessions: {e}"))?;
    let already_running = sessions
        .iter()
        .any(|line| line.split_whitespace().next() == Some(session_name.as_str()));
    if already_running {
        return Ok(HermesStatus::Running { session_name });
    }

    // Route through supervisor (Story 1.14b + 1.16a): supervisor PTY-
    // wraps `hermes` so the TUI gets a real TTY (color, cursor, kbd)
    // AND writes a `.pty.raw` tap file that 1.16c's xterm.js consumer
    // will tail.
    let workspace_config = read_workspace_config()?;
    let supervisor_bin = find_supervisor_binary();
    let hermes_bin = find_hermes_binary();

    let cwd = PathBuf::from(&project.path);
    let config = SpawnPaneConfig {
        session_name: session_name.clone(),
        command: supervisor_bin,
        args: vec![
            "hermes".to_string(),        // persona-id → vault/personas/hermes/log/
            workspace_config.vault_path, // vault root
            "--".to_string(),            // argv separator
            hermes_bin,                  // child command
        ],
        env: HashMap::new(),
        cwd: Some(cwd),
        // Pane name per the AC: "a Zellij pane labeled 'Hermes'".
        pane_name: Some(format!("Hermes · {}", project.name)),
        // Story 1.15-compatible: pane stays open even if Hermes exits,
        // so we can observe what happened.
        close_on_exit: false,
    };

    zellij::spawn_pane(config).map_err(|e| format!("spawn pane: {e}"))?;

    Ok(HermesStatus::Running { session_name })
}

/// Kill the Hermes session for a given project. Used by the UI to
/// surface "stop Hermes" without affecting the Dev session (each
/// persona has its own Zellij session).
#[tauri::command]
pub fn kill_hermes(project_id: String) -> Result<(), String> {
    let session_name = hermes_session_name(&project_id);
    // The PaneHandle::kill() invokes `zellij delete-session --force`.
    // If the session doesn't exist, this errors out — accept that and
    // surface it as a string to the frontend.
    let handle = c4n_zellij_adapter::PaneHandle {
        session_name,
        pane_name: None,
    };
    handle.kill().map_err(|e| format!("kill hermes: {e}"))
}

// ────────────────────────────────────────────────────────────────────
// Story 2.3 — Frontend Designer (Antigravity CLI) persona spawn
// ────────────────────────────────────────────────────────────────────
//
// Mirrors the Dev and Hermes spawn patterns. The Frontend Designer runs
// Antigravity CLI (`agy`) in its own Zellij session (`designer-<project-id>`)
// through the persona-supervisor. Before spawning, we:
//   1. Project `agy.md` into the project root (analogous to `claude.md`).
//   2. Read recent vault entries and append them as context so the
//      designer persona starts with up-to-date working memory. (Epic 3.)
//
// agy.md projection file: `agy.md` at `<project-root>/` — Antigravity
// CLI reads this file automatically, just like Claude Code reads `claude.md`.
// The canonical persona source is `packages/persona-sync/src/personas/designer.md`.

/// BMAD customize-chain override path for the Frontend Designer persona.
/// Mirrors PROJECT_DEV_OVERRIDE_RELPATH.
const PROJECT_DESIGNER_OVERRIDE_RELPATH: &str = "_bmad/custom/agents/designer.md";

/// Filename written to the project root when the designer persona spawns.
const AGY_MD_FILENAME: &str = "agy.md";

/// Default binary name for Antigravity CLI.
const AGY_BIN_DEFAULT: &str = "agy";

/// Env var that overrides the Antigravity CLI binary path.
const AGY_BIN_ENV: &str = "C4N_AGY_BIN";

/// Number of recent vault entries to inject into agy.md at spawn time.
const VAULT_CONTEXT_ENTRY_LIMIT: usize = 8;

/// Status of the Frontend Designer persona for a given project.
/// Shape mirrors `DevPersonaStatus` and `HermesStatus`.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "state", rename_all = "kebab-case")]
pub enum DesignerPersonaStatus {
    ZellijMissing,
    NotRunning { session_name: String },
    Running { session_name: String },
}

fn designer_session_name(project_id: &str) -> String {
    format!("designer-{project_id}")
}

fn find_agy_binary() -> String {
    std::env::var(AGY_BIN_ENV).unwrap_or_else(|_| AGY_BIN_DEFAULT.to_string())
}

/// Resolve the Frontend Designer persona content. BMAD customize-chain:
/// a project-level override wins over the bundled default.
fn resolve_designer_persona_content(
    project_root: &Path,
) -> Result<(String, PersonaSource), String> {
    let override_path = project_root.join(PROJECT_DESIGNER_OVERRIDE_RELPATH);
    if override_path.exists() {
        let content = std::fs::read_to_string(&override_path)
            .map_err(|e| format!("read {}: {e}", override_path.display()))?;
        return Ok((content, PersonaSource::ProjectOverride));
    }
    Ok((BUNDLED_DESIGNER_PERSONA_MD.to_string(), PersonaSource::Bundled))
}

/// Build the agy.md content: persona text + optional vault context section.
/// The vault context is appended after the persona file's trailing `---`
/// delimiter so it appears as "working memory" that the designer can
/// consult at session start.
fn build_agy_md_with_vault_context(
    persona_content: &str,
    vault_path: &Path,
) -> String {
    let entries = platform_fs::recent_vault_entries(vault_path, VAULT_CONTEXT_ENTRY_LIMIT)
        .unwrap_or_default();
    let context_section = platform_fs::format_vault_context(&entries);

    // Persona file ends with `---`. Append the vault section after it.
    format!("{persona_content}{context_section}")
}

/// Internal: resolve persona + inject vault context, then write agy.md.
fn project_agy_md_inner(
    project_root: &Path,
    vault_path: &Path,
) -> Result<ClaudeMdProjection, String> {
    let (persona_content, source) = resolve_designer_persona_content(project_root)?;
    let full_content = build_agy_md_with_vault_context(&persona_content, vault_path);
    let target = project_root.join(AGY_MD_FILENAME);
    std::fs::write(&target, &full_content)
        .map_err(|e| format!("write {}: {e}", target.display()))?;
    Ok(ClaudeMdProjection {
        source,
        written_to: target.to_string_lossy().to_string(),
        bytes_written: full_content.len(),
    })
}

/// Query whether the Frontend Designer persona for the given project is
/// currently running in a Zellij pane.
#[tauri::command]
pub fn designer_persona_status(project_id: String) -> Result<DesignerPersonaStatus, String> {
    if !zellij::is_available() {
        return Ok(DesignerPersonaStatus::ZellijMissing);
    }
    let session_name = designer_session_name(&project_id);
    let sessions = zellij::list_sessions().map_err(|e| format!("list sessions: {e}"))?;
    let running = sessions
        .iter()
        .any(|line| line.split_whitespace().next() == Some(session_name.as_str()));
    Ok(if running {
        DesignerPersonaStatus::Running { session_name }
    } else {
        DesignerPersonaStatus::NotRunning { session_name }
    })
}

/// Spawn the Frontend Designer persona (Antigravity CLI) into a Zellij
/// pane named `designer-<project-id>`. Projects agy.md (with vault
/// context appended) before spawning. Reuses the session if it exists.
#[tauri::command]
pub fn spawn_designer_persona(project_id: String) -> Result<DesignerPersonaStatus, String> {
    if !zellij::is_available() {
        return Ok(DesignerPersonaStatus::ZellijMissing);
    }

    let project = read_active_project()?
        .ok_or_else(|| "no active project — call open_project first".to_string())?;
    if project.id != project_id {
        return Err(format!(
            "project_id {project_id} doesn't match active project {}",
            project.id
        ));
    }

    let workspace_config = read_workspace_config()?;
    let vault_path = PathBuf::from(&workspace_config.vault_path);

    // Project agy.md with vault context before spawning.
    project_agy_md_inner(Path::new(&project.path), &vault_path)?;

    let session_name = designer_session_name(&project.id);

    let sessions = zellij::list_sessions().map_err(|e| format!("list sessions: {e}"))?;
    let already_running = sessions
        .iter()
        .any(|line| line.split_whitespace().next() == Some(session_name.as_str()));
    if already_running {
        return Ok(DesignerPersonaStatus::Running { session_name });
    }

    let supervisor_bin = find_supervisor_binary();
    let agy_bin = find_agy_binary();

    let cwd = PathBuf::from(&project.path);
    let config = SpawnPaneConfig {
        session_name: session_name.clone(),
        command: supervisor_bin,
        args: vec![
            "frontend-designer".to_string(),
            workspace_config.vault_path,
            "--".to_string(),
            agy_bin,
        ],
        env: HashMap::new(),
        cwd: Some(cwd),
        pane_name: Some(format!("Designer · {}", project.name)),
        close_on_exit: false,
    };

    zellij::spawn_pane(config).map_err(|e| format!("spawn pane: {e}"))?;

    Ok(DesignerPersonaStatus::Running { session_name })
}

/// Kill the Frontend Designer session for a given project.
#[tauri::command]
pub fn kill_designer_persona(project_id: String) -> Result<(), String> {
    let session_name = designer_session_name(&project_id);
    let handle = c4n_zellij_adapter::PaneHandle {
        session_name,
        pane_name: None,
    };
    handle.kill().map_err(|e| format!("kill designer: {e}"))
}

/// Re-project agy.md without spawning. Useful for "refresh persona context"
/// flows after editing the override or after new vault entries land.
#[tauri::command]
pub fn project_agy_md(project_path: String) -> Result<ClaudeMdProjection, String> {
    let p = PathBuf::from(&project_path);
    if !p.exists() {
        return Err(format!("path does not exist: {project_path}"));
    }
    if !p.is_dir() {
        return Err(format!("not a directory: {project_path}"));
    }
    let workspace_config = read_workspace_config()?;
    let vault_path = PathBuf::from(&workspace_config.vault_path);
    project_agy_md_inner(&p, &vault_path)
}

// ────────────────────────────────────────────────────────────────────
// Story 2.3 — Obsidian vault bridge commands
// ────────────────────────────────────────────────────────────────────
//
// These commands expose the vault read/write surface to the frontend so
// the Personas panel can show "N vault entries loaded" at spawn time and
// offer a "Write vault note" action.
//
// Write-back via the bus (Stories 2.7-2.10) layers on top later; for M2
// we write directly to vault files. The bus write-back path is deferred
// pending bus-client implementation.

/// Summary of recent vault entries, returned to the frontend to show
/// context state in the Personas panel.
#[derive(Debug, Clone, Serialize)]
pub struct VaultContextSummary {
    /// Number of vault entries that would be injected at spawn time.
    pub entry_count: usize,
    /// Titles (filenames without extension) of the loaded entries.
    pub titles: Vec<String>,
    /// Total character count across all entry content.
    pub total_chars: usize,
}

/// Return a summary of recent vault entries without writing them to disk.
/// The frontend uses this to render "8 vault entries loaded" in the
/// Personas panel status line.
#[tauri::command]
pub fn vault_context_summary() -> Result<VaultContextSummary, String> {
    let workspace_config = read_workspace_config()?;
    let vault_path = PathBuf::from(&workspace_config.vault_path);
    let entries =
        platform_fs::recent_vault_entries(&vault_path, VAULT_CONTEXT_ENTRY_LIMIT)
            .map_err(|e| format!("read vault: {e}"))?;
    let total_chars = entries.iter().map(|e| e.content.len()).sum();
    let titles = entries
        .iter()
        .map(|e| {
            e.path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("note")
                .to_string()
        })
        .collect();
    Ok(VaultContextSummary {
        entry_count: entries.len(),
        titles,
        total_chars,
    })
}

/// Write a new Markdown note into the vault inbox directory. Used for
/// agent write-back: the Personas panel can invoke this to let the designer
/// persona log decisions or notes back to the Obsidian vault.
///
/// File path: `<vault>/inbox/<YYYY-MM-DD>-<slug>.md`
/// If a file with that slug already exists for the day, content is appended.
#[tauri::command]
pub fn write_vault_note(title: String, body: String) -> Result<String, String> {
    if title.is_empty() {
        return Err("title must not be empty".to_string());
    }
    let workspace_config = read_workspace_config()?;
    let vault_path = PathBuf::from(&workspace_config.vault_path);
    let inbox = vault_path.join("inbox");
    std::fs::create_dir_all(&inbox).map_err(|e| format!("create inbox dir: {e}"))?;

    let now = chrono_date_string();
    let slug: String = title
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    let filename = format!("{now}-{slug}.md");
    let path = inbox.join(&filename);

    let content = if path.exists() {
        // Append to existing note with a timestamp separator.
        let separator = format!("\n\n---\n_Appended {now}_\n\n{body}\n");
        separator
    } else {
        format!("# {title}\n\n_Created {now}_\n\n{body}\n")
    };

    use std::io::Write;
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| format!("open vault note: {e}"))?;
    file.write_all(content.as_bytes())
        .map_err(|e| format!("write vault note: {e}"))?;
    file.flush().map_err(|e| format!("flush vault note: {e}"))?;

    Ok(path.to_string_lossy().to_string())
}

/// Convert Unix days-since-epoch to a civil `(year, month, day)` without
/// pulling in a calendar crate (dep-lean policy).
/// Reference: https://howardhinnant.github.io/date_algorithms.html
fn civil_from_unix_days(days: u64) -> (i64, u64, u64) {
    let z = days as i64 + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d)
}

/// Returns the current date as `YYYY-MM-DD`. Used for vault note filenames.
fn chrono_date_string() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let (y, m, d) = civil_from_unix_days(secs / 86400);
    format!("{y:04}-{m:02}-{d:02}")
}

/// Returns the current UTC time as an ISO 8601 string
/// (`YYYY-MM-DDTHH:MM:SSZ`), per the vault-layout timestamp convention.
fn iso8601_utc_now() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let (y, mo, d) = civil_from_unix_days(secs / 86400);
    let rem = secs % 86400;
    let (h, mi, s) = (rem / 3600, (rem % 3600) / 60, rem % 60);
    format!("{y:04}-{mo:02}-{d:02}T{h:02}:{mi:02}:{s:02}Z")
}

// ────────────────────────────────────────────────────────────────────
// Story 3.1 — BMad Builder: dynamic persona spawn
// ────────────────────────────────────────────────────────────────────
//
// The BMad Builder "Add Agent" panel lets the user spawn a dynamic persona
// by name + backing CLI + lifecycle. Each dynamic persona gets:
//   - A unique Zellij session: `dyn-<slug>-<project-id>`
//   - A persona dir in the vault: `vault/personas/<slug>/`
//   - A minimal persona file projected into `<project-root>/`
//
// Lifecycle variants:
//   - "persistent": close_on_exit = false (session survives app restarts)
//   - "ephemeral": close_on_exit = true (pane auto-closes when CLI exits)
//
// Backing CLI variants: "claude" | "agy" | "hermes" | custom binary name.
// The supervisor wraps the CLI to capture stdout/stderr (same as fixed
// personas). Persona file written: `claude.md` (for Claude), `agy.md`
// (for agy), `agent.md` (for others).

/// Status of a dynamic persona pane.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DynamicPersonaInfo {
    /// Human-readable name the user gave at spawn time.
    pub name: String,
    /// Slugified name used in session/dir names.
    pub slug: String,
    /// Backing CLI binary name (e.g. "claude", "agy").
    pub backing_cli: String,
    /// Lifecycle: "persistent" or "ephemeral".
    pub lifecycle: String,
    /// Zellij session name.
    pub session_name: String,
    /// Whether the Zellij session is currently running.
    pub running: bool,
    /// Stable bus identity `agent:<slug>:<uuid>` (Story 3.3). The persona
    /// posts/subscribes under this identity; the bus relay (Story 2.7+)
    /// reads the same value from `.persona-meta.json`.
    pub bus_identity: String,
    /// Absolute path to the persona's vault directory
    /// (`<vault>/personas/<slug>/`), scaffolded per docs/vault-layout.md.
    pub vault_dir: String,
}

// ── Story 3.3 — persistent dynamic agent: vault dir + bus identity ─────
//
// A persistent dynamic persona is a first-class team member: it gets its
// own Zellij pane (Story 3.1), its own vault directory laid out per
// docs/vault-layout.md (Story 1.6), and a stable bus identity so it can
// post/subscribe on the message bus. The bus identity is persisted in
// `.persona-meta.json` so it survives re-spawns and so the bus relay
// (Story 2.7+) can register the same identity.

/// Vault-layout version this code scaffolds (docs/vault-layout.md v1.0).
const VAULT_DIR_VERSION: &str = "1.0";

/// Env var carrying a persona's bus identity into its supervised process.
/// The persona reads it to know who it is on the bus; the bus relay uses
/// the same value (from `.persona-meta.json`) when it lands in Story 2.7+.
const BUS_IDENTITY_ENV: &str = "C4N_BUS_IDENTITY";

/// Runtime metadata persisted at `personas/<slug>/.persona-meta.json`
/// (docs/vault-layout.md → `.persona-meta.json` schema v1.0). `bus_identity`
/// is the Story 3.3 addition.
#[derive(Debug, Clone, Serialize, Deserialize)]
struct PersonaMeta {
    #[serde(rename = "$schema")]
    schema: String,
    persona_id: String,
    /// "fixed" | "dynamic".
    persona_type: String,
    /// "persistent" | "ephemeral".
    lifecycle: String,
    backing_cli: String,
    /// ISO 8601 UTC timestamp of first spawn.
    spawned_at: String,
    vault_dir_version: String,
    /// Stable `agent:<slug>:<uuid>` identity (Story 3.3).
    bus_identity: String,
}

/// Generate a non-cryptographic UUID-v4-shaped string (8-4-4-4-12 hex).
///
/// We avoid the `uuid`/`rand` crates (same dep-lean rationale as the FNV
/// `project_id_from_path` hash): a local bus identity needs uniqueness,
/// not cryptographic unpredictability. Entropy sources mixed through two
/// FNV-1a passes: high-resolution clock, pid, a process-lifetime atomic
/// counter, and a heap address (ASLR).
fn generate_uuid_v4() -> String {
    use std::sync::atomic::AtomicU64;
    static COUNTER: AtomicU64 = AtomicU64::new(0);

    fn fnv1a(seed: u64, bytes: &[u8]) -> u64 {
        let mut h = seed;
        for &b in bytes {
            h ^= b as u64;
            h = h.wrapping_mul(0x100000001b3);
        }
        h
    }

    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0);
    let count = COUNTER.fetch_add(1, Ordering::Relaxed);
    let pid = std::process::id() as u64;
    let boxed = Box::new(0u8);
    let addr = (&*boxed as *const u8) as u64;

    let mut buf = Vec::with_capacity(32);
    buf.extend_from_slice(&nanos.to_le_bytes());
    buf.extend_from_slice(&count.to_le_bytes());
    buf.extend_from_slice(&pid.to_le_bytes());
    buf.extend_from_slice(&addr.to_le_bytes());

    let hi = fnv1a(0xcbf29ce484222325, &buf);
    let lo = fnv1a(hi ^ 0x9e3779b97f4a7c15, &buf);

    let mut bytes = [0u8; 16];
    bytes[..8].copy_from_slice(&hi.to_be_bytes());
    bytes[8..].copy_from_slice(&lo.to_be_bytes());
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx

    let h = |b: &[u8]| b.iter().map(|x| format!("{x:02x}")).collect::<String>();
    format!(
        "{}-{}-{}-{}-{}",
        h(&bytes[0..4]),
        h(&bytes[4..6]),
        h(&bytes[6..8]),
        h(&bytes[8..10]),
        h(&bytes[10..16]),
    )
}

/// Build a persona bus identity: `agent:<slug>:<uuid>` (Story 3.3).
fn build_bus_identity(slug: &str) -> String {
    format!("agent:{slug}:{}", generate_uuid_v4())
}

/// Scaffold a persona's vault directory per docs/vault-layout.md (Story
/// 1.6 layout): `log/`, `skills/`, `memory/` subdirs + `.persona-meta.json`.
///
/// Idempotent and stable across re-spawns: if `.persona-meta.json` already
/// exists and parses, its identity + spawn time are preserved and returned;
/// only on first spawn (or a corrupt meta) is a fresh bus identity minted.
fn ensure_persona_vault_dir(
    vault_path: &Path,
    slug: &str,
    persona_type: &str,
    lifecycle: &str,
    backing_cli: &str,
) -> Result<PersonaMeta, String> {
    let persona_dir = vault_path.join("personas").join(slug);
    for sub in ["log", "skills", "memory"] {
        std::fs::create_dir_all(persona_dir.join(sub))
            .map_err(|e| format!("create persona {sub} dir: {e}"))?;
    }

    let meta_path = persona_dir.join(".persona-meta.json");
    if meta_path.exists() {
        let raw =
            std::fs::read_to_string(&meta_path).map_err(|e| format!("read persona meta: {e}"))?;
        if let Ok(existing) = serde_json::from_str::<PersonaMeta>(&raw) {
            return Ok(existing);
        }
        // Corrupt/old meta — fall through and rewrite with a fresh identity.
    }

    let meta = PersonaMeta {
        schema: VAULT_DIR_VERSION.to_string(),
        persona_id: slug.to_string(),
        persona_type: persona_type.to_string(),
        lifecycle: lifecycle.to_string(),
        backing_cli: backing_cli.to_string(),
        spawned_at: iso8601_utc_now(),
        vault_dir_version: VAULT_DIR_VERSION.to_string(),
        bus_identity: build_bus_identity(slug),
    };
    let body =
        serde_json::to_string_pretty(&meta).map_err(|e| format!("serialize persona meta: {e}"))?;
    std::fs::write(&meta_path, body).map_err(|e| format!("write persona meta: {e}"))?;
    Ok(meta)
}

/// Slugify a name for use in session and directory names.
/// "My Custom Architect" → "my-custom-architect"
fn slugify_name(name: &str) -> String {
    let mut slug: String = name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    // Collapse consecutive dashes and trim.
    let mut result = String::with_capacity(slug.len());
    let mut prev_dash = false;
    for c in slug.chars() {
        if c == '-' {
            if !prev_dash { result.push(c); }
            prev_dash = true;
        } else {
            result.push(c);
            prev_dash = false;
        }
    }
    slug = result.trim_matches('-').to_string();
    if slug.is_empty() { "agent".to_string() } else { slug }
}

/// Generate the session name for a dynamic persona.
fn dynamic_session_name(slug: &str, project_id: &str) -> String {
    format!("dyn-{slug}-{project_id}")
}

/// Determine the persona file name to write for a given backing CLI.
fn persona_filename_for_cli(backing_cli: &str) -> &'static str {
    match backing_cli {
        "claude" => "claude.md",
        "agy" => "agy.md",
        _ => "agent.md",
    }
}

/// Build the minimal persona file content for a dynamic agent.
fn build_dynamic_persona_content(name: &str, backing_cli: &str, project_name: &str) -> String {
    format!(
        "# {filename} — {name}\n\n\
You are **{name}**, a dynamic persona spawned by 4neverCompany OS for the **{project_name}** project.\n\n\
## Identity\n\n\
You are a specialized agent running on **{backing_cli}**. Your scope is defined by the task you've been assigned. \
Coordinate with other personas via the pub/sub bus; Hermes Agent intervenes only when chatter has no forward motion.\n\n\
## Working style\n\n\
- Execute, don't speculate. Start with the task context available to you.\n\
- Run validation gates before claiming done.\n\
- Brief, accurate commits or outputs.\n\n\
---\n",
        filename = persona_filename_for_cli(backing_cli),
        name = name,
        project_name = project_name,
        backing_cli = backing_cli,
    )
}

/// Spawn a dynamic persona via the BMad Builder. Creates a Zellij session,
/// writes a minimal persona file, and returns the persona info.
#[tauri::command]
pub fn spawn_dynamic_persona(
    name: String,
    backing_cli: String,
    lifecycle: String,
) -> Result<DynamicPersonaInfo, String> {
    if name.trim().is_empty() {
        return Err("name must not be empty".to_string());
    }
    let allowed_lifecycles = ["persistent", "ephemeral"];
    if !allowed_lifecycles.contains(&lifecycle.as_str()) {
        return Err(format!("lifecycle must be one of: {}", allowed_lifecycles.join(", ")));
    }
    // Resolve project context.
    let project = read_active_project()?
        .ok_or_else(|| "no active project — open a project first".to_string())?;

    if !zellij::is_available() {
        return Err("Zellij is not installed or not on PATH — install it first".to_string());
    }

    let slug = slugify_name(&name);
    let session_name = dynamic_session_name(&slug, &project.id);

    // Story 3.3: scaffold the persona's vault dir (log/skills/memory +
    // .persona-meta.json) and load-or-mint its stable bus identity. Done
    // before the already-running check so a re-spawn returns the SAME
    // identity rather than minting a fresh one.
    let workspace_config = read_workspace_config()?;
    let vault_path = PathBuf::from(&workspace_config.vault_path);
    let meta = ensure_persona_vault_dir(&vault_path, &slug, "dynamic", &lifecycle, &backing_cli)?;
    let persona_vault_dir = vault_path.join("personas").join(&slug);

    // Check if already running; if so, just return running state.
    let sessions = zellij::list_sessions().map_err(|e| format!("list sessions: {e}"))?;
    if sessions.iter().any(|l| l.split_whitespace().next() == Some(session_name.as_str())) {
        return Ok(DynamicPersonaInfo {
            name,
            slug,
            backing_cli,
            lifecycle,
            session_name,
            running: true,
            bus_identity: meta.bus_identity,
            vault_dir: persona_vault_dir.to_string_lossy().to_string(),
        });
    }

    let project_root = PathBuf::from(&project.path);

    // Write the persona file into the project root.
    let persona_content = build_dynamic_persona_content(&name, &backing_cli, &project.name);
    let persona_file = project_root.join(persona_filename_for_cli(&backing_cli));
    std::fs::write(&persona_file, &persona_content)
        .map_err(|e| format!("write persona file: {e}"))?;

    // Determine the CLI binary to spawn.
    let cli_bin = if backing_cli == "claude" {
        std::env::var("C4N_CLAUDE_BIN").unwrap_or_else(|_| "claude".to_string())
    } else if backing_cli == "agy" {
        std::env::var(AGY_BIN_ENV).unwrap_or_else(|_| AGY_BIN_DEFAULT.to_string())
    } else {
        backing_cli.clone()
    };

    let close_on_exit = lifecycle == "ephemeral";
    let supervisor_bin = find_supervisor_binary();

    // Story 3.3: hand the persona its bus identity via the environment so
    // it (and the supervisor) post/subscribe under one stable identity.
    let mut env = HashMap::new();
    env.insert(BUS_IDENTITY_ENV.to_string(), meta.bus_identity.clone());

    let pane_name = format!("{} · {}", name, project.name);
    let config = SpawnPaneConfig {
        session_name: session_name.clone(),
        command: supervisor_bin,
        args: vec![
            slug.clone(),
            workspace_config.vault_path.clone(),
            "--".to_string(),
            cli_bin,
        ],
        env,
        cwd: Some(project_root),
        pane_name: Some(pane_name),
        close_on_exit,
    };

    zellij::spawn_pane(config).map_err(|e| format!("spawn dynamic pane: {e}"))?;

    Ok(DynamicPersonaInfo {
        name,
        slug,
        backing_cli,
        lifecycle,
        session_name,
        running: true,
        bus_identity: meta.bus_identity,
        vault_dir: persona_vault_dir.to_string_lossy().to_string(),
    })
}

/// Kill a running dynamic persona by its session name.
#[tauri::command]
pub fn kill_dynamic_persona(session_name: String) -> Result<(), String> {
    if !zellij::is_available() {
        return Err("Zellij not available".to_string());
    }
    let handle = c4n_zellij_adapter::PaneHandle { session_name: session_name.clone(), pane_name: None };
    handle.kill().map_err(|e| format!("kill dynamic persona {session_name}: {e}"))
}

// ────────────────────────────────────────────────────────────────────
// Story 1.16c — Tail `.pty.raw` for the xterm.js consumer in the webview
// ────────────────────────────────────────────────────────────────────
//
// Architecture:
//
//   supervisor (in Zellij session) → writes <vault>/personas/<id>/log/<date>.pty.raw
//                                    (append-only; raw PTY bytes incl. ANSI escapes)
//                                                  │
//                                                  ▼
//   tail_persona_pty (this command) reads the file from `position` forward,
//   sends new bytes via a Tauri Channel<Vec<u8>>, sleeps 80ms, repeats.
//                                                  │
//                                                  ▼
//   PtyTail.ts (frontend) feeds bytes into xterm.js — full-fidelity TUI display
//
// The polling cadence (80ms) is the perceived-latency vs CPU trade-off:
// 80ms ≈ 12 reads/sec — fast enough that TUI cursor movement still feels
// snappy, slow enough that idle taps cost nothing measurable. Note from
// `notify` would be lower-latency but adds a watcher per persona; polling
// scales linearly with active personas (~2 — Dev + Hermes) so the simpler
// approach wins for M1.
//
// Cross-day rotation: the supervisor opens the per-day tap file ONCE at
// `supervise()` start and keeps writing to it across midnight (its file
// handle is bound to the original date). `find_latest_pty_raw` picks the
// most-recently-modified `*.pty.raw` in the persona's log dir so we always
// follow the file the supervisor is actually appending to, regardless of
// what today's date is now vs at supervisor start.
//
// Read-only: 1.16c ships display only. Input forwarding (`.pty.in` write
// path + supervisor watcher) is split to 1.16d so a regression in the
// input plumbing doesn't poison the display layer.

/// Maps `persona_id → stop flag` so we can cancel a running tail task
/// from a separate command (`stop_persona_pty_tail`) on view unmount.
/// Registered as Tauri State in `lib.rs` so all commands share one
/// registry across the app's lifetime.
#[derive(Default)]
pub struct PtyTailRegistry {
    handles: StdMutex<HashMap<String, Arc<AtomicBool>>>,
}

/// How often the tail task polls the tap file for new bytes. Picked to
/// balance perceived latency (a TUI cursor blink at ~500ms feels jerky
/// at >150ms poll; 80ms feels live) against idle CPU.
const PTY_TAIL_POLL_MS: u64 = 80;

/// Cap the first-read on attach so we don't load a multi-hour
/// `.pty.raw` (could be 100MB+) into memory + Channel transit. xterm.js
/// only renders ~10k scrollback lines anyway, so anything older is
/// noise from the UI's perspective. Subsequent polls deliver real-time
/// bytes incrementally so this cap never bites in steady state.
///
/// Sanity-window: ~80 cols × 10k lines × ~2 bytes/char (ANSI inflates
/// the byte count) ≈ 1.6MB. 256KB sacrifices a few screens of scrollback
/// on first attach for a tighter memory bound; everything older is on
/// disk in the tap file if a future story wants to mine it.
const PTY_TAIL_INITIAL_CAP_BYTES: u64 = 256 * 1024;

// Compile-time guardrail against bumping the cap past sanity bounds.
// Runtime asserts on consts trip clippy's `assertions_on_constants` lint,
// so use a `const _` block — evaluated at compile time, no test needed.
const _PTY_TAIL_CAP_LOWER_BOUND: () = {
    assert!(
        PTY_TAIL_INITIAL_CAP_BYTES >= 64 * 1024,
        "initial cap too small — TUIs need at least ~one screen of context"
    );
};
const _PTY_TAIL_CAP_UPPER_BOUND: () = {
    assert!(
        PTY_TAIL_INITIAL_CAP_BYTES <= 8 * 1024 * 1024,
        "initial cap too large — defeats the OOM-guard purpose"
    );
};

/// Vault-relative path that the supervisor (Story 1.16a) appends to.
///
/// We can't call `c4n_persona_supervisor::pty_raw_file_path` directly
/// here because that helper bakes in TODAY's date — but the supervisor
/// uses the date at its OWN start. Across midnight those disagree.
/// `find_latest_pty_raw` resolves the actual file by mtime.
fn find_latest_pty_raw(vault: &Path, persona_id: &str) -> std::io::Result<Option<PathBuf>> {
    let dir = vault.join("personas").join(persona_id).join("log");
    if !dir.exists() {
        return Ok(None);
    }
    let mut newest: Option<(std::time::SystemTime, PathBuf)> = None;
    for entry in std::fs::read_dir(&dir)? {
        let entry = entry?;
        let path = entry.path();
        // Match files whose name ends in `.pty.raw` (not just `.raw`).
        let is_pty_raw = path
            .file_name()
            .and_then(|s| s.to_str())
            .is_some_and(|n| n.ends_with(".pty.raw"));
        if !is_pty_raw {
            continue;
        }
        let modified = entry.metadata()?.modified()?;
        if newest.as_ref().is_none_or(|(t, _)| modified > *t) {
            newest = Some((modified, path));
        }
    }
    Ok(newest.map(|(_, p)| p))
}

/// Start tailing the supervisor's `.pty.raw` file for the given persona.
/// New bytes flow into the provided `on_chunk` Tauri Channel. Returns
/// immediately; the actual tail runs on a background tokio task.
///
/// Calling this with a `persona_id` that already has an active tail
/// cancels the old one first (defensive against React's StrictMode +
/// hot-reload double-mount, which would otherwise leak tail tasks).
///
/// The task exits when:
///   - `stop_persona_pty_tail(persona_id)` is called
///   - A subsequent `tail_persona_pty(persona_id, ...)` replaces it
///   - The Channel send fails (frontend dropped it)
///   - The process exits
#[tauri::command]
pub async fn tail_persona_pty(
    persona_id: String,
    on_chunk: Channel<Vec<u8>>,
    registry: State<'_, PtyTailRegistry>,
) -> Result<(), String> {
    // Cancel any existing tail for this persona FIRST so we don't
    // double-stream while two tasks race on the same channel.
    {
        let mut handles = registry
            .handles
            .lock()
            .map_err(|e| format!("registry lock poisoned: {e}"))?;
        if let Some(flag) = handles.remove(&persona_id) {
            flag.store(true, Ordering::SeqCst);
        }
    }

    let workspace = read_workspace_config()?;
    let vault = PathBuf::from(workspace.vault_path);

    let stop_flag = Arc::new(AtomicBool::new(false));
    {
        let mut handles = registry
            .handles
            .lock()
            .map_err(|e| format!("registry lock poisoned: {e}"))?;
        handles.insert(persona_id.clone(), stop_flag.clone());
    }

    let persona_id_task = persona_id.clone();
    tokio::spawn(async move {
        let mut position: u64 = 0;
        let mut current_file_path: Option<PathBuf> = None;
        let mut first_read_for_file = true;
        let poll = std::time::Duration::from_millis(PTY_TAIL_POLL_MS);

        loop {
            if stop_flag.load(Ordering::SeqCst) {
                tracing::debug!(
                    "tail_persona_pty: stop flag set for {}, exiting",
                    persona_id_task
                );
                break;
            }

            match find_latest_pty_raw(&vault, &persona_id_task) {
                Ok(Some(path)) => {
                    // Reset position when the supervisor rotates to a new
                    // day's file (cross-midnight) or when we first attach.
                    if current_file_path.as_ref() != Some(&path) {
                        position = 0;
                        current_file_path = Some(path.clone());
                        first_read_for_file = true;
                    }

                    if let Ok(meta) = std::fs::metadata(&path) {
                        let size = meta.len();
                        if size > position {
                            // First read for this file: cap the catch-up
                            // chunk so an hours-long .pty.raw doesn't
                            // allocate hundreds of MB + JSON-encode them
                            // through the Channel. Skip past everything
                            // older than the cap; xterm.js only renders
                            // ~10k scrollback lines anyway so older bytes
                            // would just be dropped on render side.
                            let take_start = if first_read_for_file
                                && size - position > PTY_TAIL_INITIAL_CAP_BYTES
                            {
                                let skipped = size - position - PTY_TAIL_INITIAL_CAP_BYTES;
                                position += skipped;
                                tracing::debug!(
                                    "tail_persona_pty: skipping {} stale bytes for {}",
                                    skipped,
                                    persona_id_task
                                );
                                position
                            } else {
                                position
                            };
                            first_read_for_file = false;

                            let take = size - take_start;
                            // Seek + bounded read so we never block on
                            // partially-written data past EOF.
                            use std::io::{Read, Seek, SeekFrom};
                            match std::fs::File::open(&path) {
                                Ok(mut f) => {
                                    if f.seek(SeekFrom::Start(take_start)).is_ok() {
                                        let mut buf = Vec::with_capacity(take as usize);
                                        let read_res = f.take(take).read_to_end(&mut buf);
                                        if read_res.is_ok() && !buf.is_empty() {
                                            position += buf.len() as u64;
                                            if on_chunk.send(buf).is_err() {
                                                tracing::debug!(
                                                    "tail_persona_pty: channel closed for {}",
                                                    persona_id_task
                                                );
                                                break;
                                            }
                                        }
                                    }
                                }
                                Err(e) => {
                                    tracing::warn!(
                                        "tail_persona_pty: open failed for {}: {e}",
                                        path.display()
                                    );
                                }
                            }
                        } else if size < position {
                            // File was truncated under our feet (rare —
                            // shouldn't happen with append-only writes,
                            // but be defensive against external rm + recreate).
                            position = 0;
                            first_read_for_file = true;
                        }
                    }
                }
                Ok(None) => {
                    // Tap file not yet created — supervisor may not have
                    // produced output yet. Quiet wait.
                }
                Err(e) => {
                    tracing::warn!("tail_persona_pty: dir scan error for {persona_id_task}: {e}");
                }
            }

            tokio::time::sleep(poll).await;
        }
    });

    Ok(())
}

/// Cancel a running `tail_persona_pty` for the given persona. Safe to
/// call when no tail is active (it's a no-op).
#[tauri::command]
pub fn stop_persona_pty_tail(
    persona_id: String,
    registry: State<'_, PtyTailRegistry>,
) -> Result<(), String> {
    let mut handles = registry
        .handles
        .lock()
        .map_err(|e| format!("registry lock poisoned: {e}"))?;
    if let Some(flag) = handles.remove(&persona_id) {
        flag.store(true, Ordering::SeqCst);
    }
    Ok(())
}

// ────────────────────────────────────────────────────────────────────
// Story 1.16d — Bidirectional input
// ────────────────────────────────────────────────────────────────────
//
// Input path (mirror of the read path):
//
//   xterm.js onData (frontend) → `write_persona_pty_in` command (this) →
//   append to <vault>/personas/<id>/log/current.pty.in →
//   supervisor's input-watcher task reads + writes to PTY writer →
//   child sees keystrokes as if typed at a real terminal.
//
// Why file-based: the supervisor runs in its own process under Zellij,
// not in the Tauri process. We can't share an in-memory handle. A
// well-known file the supervisor polls (and the desktop appends to) is
// the simplest portable channel.
//
// Path layout matches the supervisor's `pty_in_file_path` helper —
// fixed `current.pty.in` (no date rotation), truncated at supervisor
// startup so previous-session input doesn't leak.

/// Vault path for the persona's `.pty.in` input queue. Mirror of the
/// supervisor's `pty_in_file_path` — kept independent here so the
/// desktop crate doesn't need a dep on the supervisor crate (which
/// would slow down the desktop's compile times for one helper function).
/// The path layout is part of the supervisor's public contract; a
/// future supervisor change moving the file would break this too.
fn pty_in_path_for(vault: &Path, persona_id: &str) -> PathBuf {
    vault
        .join("personas")
        .join(persona_id)
        .join("log")
        .join("current.pty.in")
}

/// Append user-typed bytes to the persona's `.pty.in` file. The
/// supervisor's watcher (Story 1.16d) drains them into the child's
/// stdin at ~50ms cadence.
///
/// The supervisor truncates `.pty.in` at startup so an append into a
/// missing/empty file is the happy path. We create the parent dir if
/// absent (defensive — should always exist once the supervisor has run
/// even once, but the call is cheap and avoids a hard-to-diagnose error
/// when the wizard's vault path was JUST written).
///
/// Bytes are taken as `Vec<u8>` rather than `String` so xterm.js can
/// send arbitrary key sequences (arrow keys, function keys, Esc-sequences,
/// Ctrl-C, etc.) without UTF-8 round-tripping mangling them.
#[tauri::command]
pub fn write_persona_pty_in(persona_id: String, bytes: Vec<u8>) -> Result<(), String> {
    if bytes.is_empty() {
        // No-op rather than touching the file — keeps the dispatcher
        // cheap when xterm.js fires onData with an empty payload.
        return Ok(());
    }

    let workspace = read_workspace_config()?;
    let vault = PathBuf::from(workspace.vault_path);
    let path = pty_in_path_for(&vault, &persona_id);

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("create pty.in parent dir: {e}"))?;
    }

    use std::io::Write;
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| format!("open pty.in: {e}"))?;
    file.write_all(&bytes)
        .map_err(|e| format!("write pty.in: {e}"))?;
    file.flush().map_err(|e| format!("flush pty.in: {e}"))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Serializes tests that mutate process-global env vars. Rust 1.86+
    /// marks `env::set_var` unsafe because it's not thread-safe — when
    /// two tests touch the same var in parallel, one's set can overwrite
    /// the other's read window and the assertion-pair race becomes
    /// observable (intermittent CI failures like the one Story 1.16c's
    /// review caught). Acquiring this mutex first makes those tests
    /// effectively serial while leaving the rest of the suite parallel.
    ///
    /// Mutex (vs RwLock) because every env-touching test both writes and
    /// reads — there's no read-mostly path to optimize for.
    static ENV_VAR_TEST_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

    #[test]
    fn project_id_is_deterministic() {
        // Same path lowercased must produce the same ID across calls so
        // session names survive restarts (AC for Story 1.15).
        let p = PathBuf::from("C:/Users/Maurice/example-project");
        let a = project_id_from_path(&p);
        let b = project_id_from_path(&p);
        assert_eq!(a, b);
        assert!(a.starts_with("example-project-"), "got: {a}");
        assert_eq!(a.len(), "example-project-".len() + 8);
    }

    #[test]
    fn project_id_differs_for_different_paths() {
        let a = project_id_from_path(&PathBuf::from("C:/Users/Maurice/project-a"));
        let b = project_id_from_path(&PathBuf::from("C:/Users/Maurice/project-b"));
        assert_ne!(a, b);
    }

    #[test]
    fn project_id_handles_unusual_basenames() {
        let id = project_id_from_path(&PathBuf::from("C:/temp/My Project (v2)!"));
        // Spaces, parens, and bangs all become dashes; runs collapsed.
        assert!(id.starts_with("my-project-v2-"), "got: {id}");
    }

    #[test]
    fn dev_session_name_format() {
        assert_eq!(
            dev_session_name("example-project-deadbeef"),
            "dev-example-project-deadbeef"
        );
    }

    // ── Story 1.13 — claude.md projection ──────────────────────────

    #[test]
    fn bundled_dev_persona_is_non_empty_and_starts_with_header() {
        // The include_str! at the top of this module must resolve. Catches
        // a path mismatch between this crate and the persona-sync package.
        assert!(
            BUNDLED_DEV_PERSONA_MD.len() > 200,
            "bundled persona too short"
        );
        assert!(
            BUNDLED_DEV_PERSONA_MD.starts_with("# claude.md"),
            "bundled persona must start with the claude.md heading"
        );
    }

    #[test]
    fn resolve_falls_back_to_bundled_when_no_override() {
        // Use a temp dir that definitely has no _bmad/custom/agents/dev.md.
        let tmp = std::env::temp_dir().join(format!("c4n-resolve-test-{}", std::process::id()));
        std::fs::create_dir_all(&tmp).unwrap();
        let (content, source) = resolve_dev_persona_content(&tmp).unwrap();
        std::fs::remove_dir_all(&tmp).ok();
        assert!(matches!(source, PersonaSource::Bundled));
        assert_eq!(content, BUNDLED_DEV_PERSONA_MD);
    }

    #[test]
    fn resolve_uses_project_override_when_present() {
        let tmp = std::env::temp_dir().join(format!("c4n-override-test-{}", std::process::id()));
        let override_path = tmp.join(PROJECT_DEV_OVERRIDE_RELPATH);
        std::fs::create_dir_all(override_path.parent().unwrap()).unwrap();
        std::fs::write(&override_path, "# Custom persona\nhello").unwrap();

        let (content, source) = resolve_dev_persona_content(&tmp).unwrap();
        std::fs::remove_dir_all(&tmp).ok();

        assert!(matches!(source, PersonaSource::ProjectOverride));
        assert_eq!(content, "# Custom persona\nhello");
    }

    #[test]
    fn project_claude_md_writes_to_project_root() {
        let tmp = std::env::temp_dir().join(format!("c4n-write-test-{}", std::process::id()));
        std::fs::create_dir_all(&tmp).unwrap();

        let result = project_claude_md_inner(&tmp).unwrap();
        assert!(matches!(result.source, PersonaSource::Bundled));
        assert_eq!(
            result.written_to,
            tmp.join(CLAUDE_MD_FILENAME).to_string_lossy()
        );
        assert!(result.bytes_written > 200);

        let on_disk = std::fs::read_to_string(tmp.join(CLAUDE_MD_FILENAME)).unwrap();
        assert_eq!(on_disk, BUNDLED_DEV_PERSONA_MD);

        std::fs::remove_dir_all(&tmp).ok();
    }

    // ── Story 1.14b — supervisor lookup ─────────────────────────────

    #[test]
    fn find_supervisor_binary_uses_env_override_when_set() {
        // Serialize against other env-touching tests — see ENV_VAR_TEST_LOCK
        // doc for why this is needed (Rust 1.86+ unsafe set_var + parallel
        // harness = observable races).
        let _guard = ENV_VAR_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let key = SUPERVISOR_BIN_ENV;
        let original = std::env::var(key).ok();
        // Safety: lock-held + set/restore pair; no other thread races.
        unsafe {
            std::env::set_var(key, "/custom/path/c4n-persona-supervisor");
        }
        assert_eq!(
            find_supervisor_binary(),
            "/custom/path/c4n-persona-supervisor"
        );
        unsafe {
            match original {
                Some(v) => std::env::set_var(key, v),
                None => std::env::remove_var(key),
            }
        }
    }

    #[test]
    fn find_supervisor_binary_falls_back_to_default_name() {
        let _guard = ENV_VAR_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let key = SUPERVISOR_BIN_ENV;
        let original = std::env::var(key).ok();
        unsafe {
            std::env::remove_var(key);
        }
        assert_eq!(find_supervisor_binary(), SUPERVISOR_BIN_DEFAULT);
        if let Some(v) = original {
            unsafe {
                std::env::set_var(key, v);
            }
        }
    }

    #[test]
    fn project_claude_md_overwrites_existing_file() {
        // AC: "the file is overwritten on subsequent project opens".
        let tmp = std::env::temp_dir().join(format!("c4n-overwrite-test-{}", std::process::id()));
        std::fs::create_dir_all(&tmp).unwrap();
        std::fs::write(tmp.join(CLAUDE_MD_FILENAME), "stale content").unwrap();

        project_claude_md_inner(&tmp).unwrap();
        let on_disk = std::fs::read_to_string(tmp.join(CLAUDE_MD_FILENAME)).unwrap();
        std::fs::remove_dir_all(&tmp).ok();

        assert_eq!(on_disk, BUNDLED_DEV_PERSONA_MD);
        assert_ne!(on_disk, "stale content");
    }

    // ── Story 1.15 — restart survival (manual verification) ─────────
    //
    // The behavior is covered by existing code paths (read_active_project
    // on launch + spawn_dev_persona's session-reuse branch). No new logic
    // ships with 1.15; this story closes by documenting the manual-
    // verification protocol in code so future contributors can re-run it.
    //
    // Mirrors the `#[ignore]` pattern used by c4n-zellij-adapter for
    // tests that require a real Zellij install + an interactive desktop.
    // Run with: `cargo test -p c4n-desktop -- --ignored`.
    //
    // See docs/restart-survival.md for the full architectural rationale.

    #[test]
    #[ignore = "manual verification protocol — requires Zellij ≥ 0.44.3, Claude Code, and the desktop app running on Win 11"]
    fn restart_survival_manual_verification() {
        // The body is intentionally a non-executing protocol description
        // rather than an automated probe. Automating it requires either
        // (a) refactoring spawn_dev_persona to take an arbitrary inner
        // command (out of scope per the story's "no source change" rule),
        // or (b) a real Claude Code install in the test environment
        // (not available in CI). Both are deferred to a follow-up.
        eprintln!(
            "\n\
             Story 1.15 — Dev persona restart-survival manual verification\n\
             ────────────────────────────────────────────────────────────\n\
             \n\
             Preconditions:\n\
               1. Zellij ≥ 0.44.3 installed and on PATH.\n\
               2. Claude Code installed and on PATH (`claude --version` works).\n\
               3. `c4n-persona-supervisor` on PATH (`cargo install --path\n\
                  crates/persona-supervisor --debug` once).\n\
               4. The first-run wizard has been completed; \n\
                  ~/.4nevercompanyos/config.toml exists with a vault_path.\n\
             \n\
             Protocol:\n\
               1. `pnpm dev:desktop` — launch.\n\
               2. Projects panel → \"Open project →\" → pick any folder.\n\
               3. Click \"Spawn Dev persona →\". Wait for the green\n\
                  \"attached\" badge (should appear in < 5 seconds).\n\
               4. In a separate shell: `zellij list-sessions` shows\n\
                  `dev-<project-id>`. `zellij attach <name>` shows the\n\
                  Claude Code prompt. Type something to confirm it's\n\
                  interactive. Ctrl+Q to detach.\n\
               5. Fully close the desktop app. Verify no `c4n-desktop`\n\
                  process remains.\n\
               6. `zellij list-sessions` STILL shows `dev-<project-id>`.\n\
                  `zellij attach <name>` STILL shows Claude Code with\n\
                  conversation history intact.\n\
               7. Detach. `pnpm dev:desktop` to relaunch.\n\
               8. ProjectsView loads showing the prior project's name +\n\
                  path within ~3 seconds. Dev persona panel shows\n\
                  \"Running\" with the same session_name.\n\
               9. `zellij list-sessions` STILL shows exactly ONE\n\
                  `dev-<project-id>` — no duplicate spawn.\n\
              10. Click \"Refresh\" — badge stays green.\n\
             \n\
             Pass condition: steps 6, 8, 9, and 10 all hold.\n\
             \n\
             Failure-mode handling:\n\
               - Step 6 fails: Zellij isn't persisting sessions across\n\
                 the desktop's exit. Either Zellij is misconfigured\n\
                 (`zellij setup --check`) or the install is < 0.44.0\n\
                 (no Windows ConPTY support). Out of 1.15 scope.\n\
               - Step 8 fails: `read_active_project()` regression — the\n\
                 active-project.toml pointer didn't survive. Check that\n\
                 the file still exists on disk.\n\
               - Step 9 produces a duplicate: the session-reuse branch\n\
                 in `spawn_dev_persona` regressed. Inspect lines around\n\
                 `if already_running` in commands/mod.rs.\n\
             "
        );
        // No assertion: this test only documents the protocol. Pass-or-
        // fail of restart survival is determined by the human running
        // the protocol on a real dev box.
    }

    // ── Story 1.18 — M1 E2E exit-criterion smoke test ───────────────
    //
    // Same shape as restart_survival_manual_verification — a non-executing
    // protocol body whose only job is to surface a discoverable pointer
    // into docs/e2e-smoke-test.md. Automating the full install → wizard →
    // spawn flow requires either (a) a Tauri WebDriver harness (M2-class
    // scope) or (b) a hermetic Windows VM with pre-staged Anthropic creds
    // (CI infra Maurice doesn't have yet). Both are deferred.

    #[test]
    #[ignore = "manual verification protocol — requires fresh Windows install + Zellij + Claude Code + Anthropic key; see docs/e2e-smoke-test.md"]
    fn e2e_scenario_manual_verification() {
        eprintln!(
            "\n\
             Story 1.18 — M1 E2E smoke test (≤ 10 min) — manual verification\n\
             ────────────────────────────────────────────────────────────────\n\
             \n\
             Full protocol:  docs/e2e-smoke-test.md\n\
             Budget table:   top of the protocol — 12 phases, 10:00 cap.\n\
             Recording slot: tests/manual/m1-exit-criterion-recording.mp4\n\
             Notes slot:     tests/manual/m1-exit-criterion-notes.md\n\
             \n\
             Prerequisites (NOT counted in the 10-min budget):\n\
               1. Clean Windows 10/11 VM (or fresh user profile).\n\
               2. Zellij ≥ 0.44.3 on PATH (`winget install zellij-org.zellij`).\n\
               3. Claude Code on PATH + authenticated.\n\
               4. Anthropic API key paste-ready.\n\
               5. Test-project folder picked.\n\
               6. `c4n-persona-supervisor` on PATH (one-time, until 1.17b\n\
                  bundles it as a Tauri sidecar):\n\
                    cargo install --path crates/persona-supervisor\n\
               7. Stopwatch + screen recorder (OBS / Game Bar / etc.).\n\
             \n\
             Start the stopwatch on the double-click of the .exe. Fill in\n\
             the Sign-off block at the bottom of docs/e2e-smoke-test.md when\n\
             done. PASS condition: total elapsed ≤ 10:00.\n\
             \n\
             Validates PRD success metric SM-1.\n\
             "
        );
        // No assertion: this test only documents the protocol. Pass-or-
        // fail of the E2E criterion is determined by the human running
        // the protocol on a real Win 10/11 box.
    }

    // ── Story 1.16b — Hermes spawn ──────────────────────────────────

    #[test]
    fn hermes_session_name_format() {
        // Same format as dev_session_name but with the `hermes-` prefix
        // so the two personas occupy different Zellij sessions.
        assert_eq!(
            hermes_session_name("example-project-deadbeef"),
            "hermes-example-project-deadbeef"
        );
    }

    #[test]
    fn hermes_session_name_differs_from_dev_for_same_project() {
        // Critical: dev and hermes MUST live in different Zellij sessions
        // so killing one doesn't kill the other. This is the guarantee
        // that lets `kill_hermes` not affect the Dev persona.
        let pid = "myproject-12345678";
        let dev = dev_session_name(pid);
        let hermes = hermes_session_name(pid);
        assert_ne!(dev, hermes);
        assert!(dev.starts_with("dev-"));
        assert!(hermes.starts_with("hermes-"));
    }

    #[test]
    fn find_hermes_binary_uses_env_override_when_set() {
        let _guard = ENV_VAR_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let key = HERMES_BIN_ENV;
        let original = std::env::var(key).ok();
        unsafe {
            std::env::set_var(key, "/custom/path/hermes");
        }
        assert_eq!(find_hermes_binary(), "/custom/path/hermes");
        unsafe {
            match original {
                Some(v) => std::env::set_var(key, v),
                None => std::env::remove_var(key),
            }
        }
    }

    #[test]
    fn find_hermes_binary_falls_back_to_default_name() {
        let _guard = ENV_VAR_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let key = HERMES_BIN_ENV;
        let original = std::env::var(key).ok();
        unsafe {
            std::env::remove_var(key);
        }
        assert_eq!(find_hermes_binary(), HERMES_BIN_DEFAULT);
        if let Some(v) = original {
            unsafe {
                std::env::set_var(key, v);
            }
        }
    }

    // ── Story 1.16c — pty.raw tail discovery + registry ─────────────

    #[test]
    fn find_latest_pty_raw_returns_none_when_dir_missing() {
        // If the persona has never produced output, the log dir doesn't
        // exist yet. The tail task must NOT error — it should keep
        // polling so it can attach when the supervisor first writes.
        let tmp = std::env::temp_dir().join(format!("c4n-tail-none-{}", std::process::id()));
        // Don't create the dir.
        let result = find_latest_pty_raw(&tmp, "ghost-persona").unwrap();
        assert!(result.is_none(), "expected None for missing dir");
    }

    #[test]
    fn find_latest_pty_raw_picks_newest_when_multiple_files() {
        // Cross-day rotation: the supervisor that started yesterday
        // appends to yesterday's file; today the user mounts the
        // MemoryView and we should follow the file that's CURRENTLY
        // being written (= most recently modified), not whatever
        // today's date suggests.
        let tmp = std::env::temp_dir().join(format!("c4n-tail-pick-{}", std::process::id()));
        let log_dir = tmp.join("personas").join("dev").join("log");
        std::fs::create_dir_all(&log_dir).unwrap();

        let older = log_dir.join("2026-05-25.pty.raw");
        let newer = log_dir.join("2026-05-26.pty.raw");
        let unrelated = log_dir.join("2026-05-26.jsonl");

        std::fs::write(&older, b"old").unwrap();
        // Ensure mtime ordering even on filesystems with low timestamp
        // granularity by sleeping briefly between writes.
        std::thread::sleep(std::time::Duration::from_millis(20));
        std::fs::write(&newer, b"new").unwrap();
        std::fs::write(&unrelated, b"unrelated").unwrap();

        let picked = find_latest_pty_raw(&tmp, "dev").unwrap().unwrap();
        assert_eq!(
            picked, newer,
            ".jsonl must be ignored; newest .pty.raw must win"
        );

        std::fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn find_latest_pty_raw_ignores_non_pty_raw_extensions() {
        // We MUST match `*.pty.raw` not just `*.raw`. If a future story
        // adds e.g. `.snapshot.raw` files in the log dir, those must
        // not be picked up as candidates.
        let tmp = std::env::temp_dir().join(format!("c4n-tail-ext-{}", std::process::id()));
        let log_dir = tmp.join("personas").join("hermes").join("log");
        std::fs::create_dir_all(&log_dir).unwrap();

        let decoy = log_dir.join("2026-05-26.snapshot.raw");
        std::fs::write(&decoy, b"decoy").unwrap();
        // No .pty.raw — must return None despite the .raw file.

        let picked = find_latest_pty_raw(&tmp, "hermes").unwrap();
        assert!(picked.is_none(), "non-pty.raw .raw files must be ignored");

        std::fs::remove_dir_all(&tmp).ok();
    }

    #[test]
    fn pty_in_path_matches_supervisor_convention() {
        // The desktop and supervisor compute this path independently.
        // If they disagree, keystrokes go into a file the supervisor
        // never reads. Pin the layout here so a typo-bump in either
        // place gets caught.
        let path = pty_in_path_for(Path::new("/vault"), "hermes");
        let s = path.to_string_lossy().replace('\\', "/");
        assert!(
            s.ends_with("/personas/hermes/log/current.pty.in"),
            "got: {s}"
        );
    }

    #[test]
    fn pty_in_path_is_not_date_rotated() {
        // 1.16d's contract: input queue is per-supervisor-instance,
        // NOT per-day. If a future refactor accidentally appends a
        // date suffix, the supervisor's startup truncation goes to a
        // different file than the desktop's appends → silent input loss.
        let path = pty_in_path_for(Path::new("/v"), "dev");
        let name = path.file_name().unwrap().to_string_lossy().to_string();
        assert_eq!(name, "current.pty.in");
        assert!(
            !name.contains("2026"),
            "pty.in filename must not be date-rotated; got: {name}"
        );
    }

    #[test]
    fn pty_tail_registry_dedupes_per_persona() {
        // Inserting a fresh handle for the same persona must replace
        // the prior one (and the prior task's stop flag should be set
        // so it exits). We don't run the actual tail task here — just
        // verify the registry behavior directly.
        let reg = PtyTailRegistry::default();
        let first = Arc::new(AtomicBool::new(false));
        let second = Arc::new(AtomicBool::new(false));

        // Insert first.
        {
            let mut h = reg.handles.lock().unwrap();
            h.insert("dev".to_string(), first.clone());
        }
        assert!(!first.load(Ordering::SeqCst));

        // Simulate what tail_persona_pty does at the top: cancel any
        // existing tail before installing the new one.
        {
            let mut h = reg.handles.lock().unwrap();
            if let Some(flag) = h.remove("dev") {
                flag.store(true, Ordering::SeqCst);
            }
            h.insert("dev".to_string(), second.clone());
        }

        assert!(
            first.load(Ordering::SeqCst),
            "first stop flag should be set after dedupe"
        );
        assert!(
            !second.load(Ordering::SeqCst),
            "second stop flag should still be clear"
        );
    }

    // ── Story 3.3 — persistent dynamic agent: vault dir + bus identity ──

    #[test]
    fn iso8601_utc_now_is_well_formed() {
        let ts = iso8601_utc_now();
        // YYYY-MM-DDTHH:MM:SSZ — 20 chars, ends in Z, has the T separator.
        assert_eq!(ts.len(), 20, "got: {ts}");
        assert!(ts.ends_with('Z'), "got: {ts}");
        assert_eq!(&ts[10..11], "T", "got: {ts}");
        assert!(ts.starts_with("20"), "got: {ts}");
    }

    #[test]
    fn generate_uuid_v4_is_well_shaped_and_unique() {
        let a = generate_uuid_v4();
        let b = generate_uuid_v4();
        assert_ne!(a, b, "two UUIDs must differ");
        for u in [&a, &b] {
            assert_eq!(u.len(), 36, "got: {u}");
            let parts: Vec<&str> = u.split('-').collect();
            assert_eq!(parts.len(), 5, "got: {u}");
            assert_eq!(
                parts.iter().map(|p| p.len()).collect::<Vec<_>>(),
                vec![8, 4, 4, 4, 12],
                "got: {u}"
            );
            // Version 4 nibble.
            assert_eq!(&parts[2][0..1], "4", "version nibble must be 4: {u}");
            // Variant nibble is one of 8/9/a/b.
            let variant = &parts[3][0..1];
            assert!(
                matches!(variant, "8" | "9" | "a" | "b"),
                "variant nibble must be 8..b: {u}"
            );
            assert!(
                u.chars().all(|c| c.is_ascii_hexdigit() || c == '-'),
                "must be hex+dashes: {u}"
            );
        }
    }

    #[test]
    fn bus_identity_has_agent_slug_uuid_shape() {
        // AC: "the persona has a unique bus identity (agent:architect:<uuid>)".
        let id = build_bus_identity("architect");
        assert!(id.starts_with("agent:architect:"), "got: {id}");
        let uuid = id.strip_prefix("agent:architect:").unwrap();
        assert_eq!(uuid.len(), 36, "uuid part wrong length: {id}");
        // Distinct personas (and re-mints) get distinct identities.
        assert_ne!(build_bus_identity("architect"), id);
    }

    #[test]
    fn ensure_persona_vault_dir_creates_layout_and_identity() {
        // AC: "vault/personas/architect/ exists with the per-persona log +
        // skills subdirs" AND "a unique bus identity (agent:architect:<uuid>)".
        let vault = std::env::temp_dir().join(format!(
            "c4n-vaultdir-{}-{}",
            std::process::id(),
            generate_uuid_v4()
        ));
        std::fs::create_dir_all(&vault).unwrap();

        let meta =
            ensure_persona_vault_dir(&vault, "architect", "dynamic", "persistent", "claude")
                .unwrap();

        let persona_dir = vault.join("personas").join("architect");
        assert!(persona_dir.join("log").is_dir(), "log/ subdir missing");
        assert!(persona_dir.join("skills").is_dir(), "skills/ subdir missing");
        assert!(persona_dir.join("memory").is_dir(), "memory/ subdir missing");
        assert!(
            persona_dir.join(".persona-meta.json").is_file(),
            ".persona-meta.json missing"
        );

        assert!(
            meta.bus_identity.starts_with("agent:architect:"),
            "got: {}",
            meta.bus_identity
        );
        assert_eq!(meta.persona_type, "dynamic");
        assert_eq!(meta.lifecycle, "persistent");
        assert_eq!(meta.backing_cli, "claude");
        assert_eq!(meta.vault_dir_version, VAULT_DIR_VERSION);

        // The persisted file round-trips to the same identity.
        let raw =
            std::fs::read_to_string(persona_dir.join(".persona-meta.json")).unwrap();
        let on_disk: PersonaMeta = serde_json::from_str(&raw).unwrap();
        assert_eq!(on_disk.bus_identity, meta.bus_identity);

        std::fs::remove_dir_all(&vault).ok();
    }

    #[test]
    fn ensure_persona_vault_dir_is_idempotent_and_stable() {
        // Re-spawning the same persona must NOT mint a new bus identity —
        // a persistent agent keeps one identity across app restarts.
        let vault = std::env::temp_dir().join(format!(
            "c4n-vaultstable-{}-{}",
            std::process::id(),
            generate_uuid_v4()
        ));
        std::fs::create_dir_all(&vault).unwrap();

        let first =
            ensure_persona_vault_dir(&vault, "architect", "dynamic", "persistent", "claude")
                .unwrap();
        let second =
            ensure_persona_vault_dir(&vault, "architect", "dynamic", "persistent", "claude")
                .unwrap();

        assert_eq!(
            first.bus_identity, second.bus_identity,
            "bus identity must be stable across re-spawns"
        );
        assert_eq!(first.spawned_at, second.spawned_at);

        std::fs::remove_dir_all(&vault).ok();
    }

    // Full spawn (pane + vault dir + bus identity together) needs a real
    // Zellij install, a supervisor on PATH, and an active project — same
    // constraints as the Dev/Hermes spawn paths. The vault-dir + identity
    // halves are covered by the automated tests above; the pane half plus
    // end-to-end wiring is verified by this manual protocol. Mirrors the
    // `#[ignore]` pattern used by restart_survival_manual_verification.
    #[test]
    #[ignore = "manual verification — requires Zellij ≥ 0.44.3, c4n-persona-supervisor on PATH, and an open project"]
    fn persistent_architect_spawn_manual_verification() {
        eprintln!(
            "\n\
             Story 3.3 — persistent dynamic agent (Architect) manual verification\n\
             ────────────────────────────────────────────────────────────────────\n\
             \n\
             Preconditions:\n\
               1. Zellij ≥ 0.44.3 on PATH; c4n-persona-supervisor on PATH.\n\
               2. First-run wizard done (~/.4nevercompanyos/config.toml has vault_path).\n\
               3. A project is open (open_project called).\n\
             \n\
             Protocol:\n\
               1. Personas rail → BMad Builder \"Add Agent\".\n\
               2. Name \"Architect\", backing CLI Claude, lifecycle Persistent → Spawn.\n\
               3. PANE: multi-terminal view shows a new pane labeled \"Architect · <project>\".\n\
                  `zellij list-sessions` shows `dyn-architect-<project-id>`.\n\
               4. VAULT DIR: `<vault>/personas/architect/` exists with `log/`,\n\
                  `skills/`, `memory/` subdirs + `.persona-meta.json`.\n\
               5. BUS IDENTITY: `.persona-meta.json` `bus_identity` reads\n\
                  `agent:architect:<uuid>`; the spawned process sees the same\n\
                  value in its `C4N_BUS_IDENTITY` env var.\n\
               6. Re-spawn Architect → `bus_identity` is UNCHANGED (stable).\n\
             \n\
             Pass condition: steps 3, 4, 5, and 6 all hold.\n\
             "
        );
    }
}
