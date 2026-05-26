//! Tauri synchronous-call surface (D-1).
//!
//! Each function annotated with `#[tauri::command]` becomes invokable
//! from the front-end via `invoke('name', args)`. Long-lived streams
//! live in `crate::ipc` instead.

use c4n_zellij_adapter::{self as zellij, SpawnPaneConfig};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

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

    let cwd = PathBuf::from(&project.path);
    let config = SpawnPaneConfig {
        session_name: session_name.clone(),
        command: "claude".to_string(),
        args: vec![],
        env: HashMap::new(),
        cwd: Some(cwd),
        pane_name: Some(format!("Dev · {}", project.name)),
        close_on_exit: false,
    };

    zellij::spawn_pane(config).map_err(|e| format!("spawn pane: {e}"))?;

    Ok(DevPersonaStatus::Running { session_name })
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
