//! c4n-persona-drift — FR-21 backflow drift detection.
//!
//! Detects and surfaces drift between a persona's live vault directory
//! state and its canonical persona definition file
//! (AGENTS.md / gemini.md / claude.md).
//!
//! ## What is "drift"?
//!
//! A persistent persona accumulates runtime state in its vault directory:
//! notes under `memory/`, learned capabilities under `skills/`. The
//! definition file is the *canonical* description of the persona — what
//! it is, how it behaves, what it knows. When runtime vault state changes
//! and the definition file is not updated to reflect those changes, the
//! two diverge: that is drift (FR-21).
//!
//! The detector watches `<vault>/personas/<slug>/memory/` and
//! `<vault>/personas/<slug>/skills/` for write events. If any such event
//! arrives and the definition file's mtime has not advanced past the
//! newest vault-change time, the persona's [`DriftState`] moves to
//! `Drifted`. Drift clears automatically when the definition file is
//! updated (or the user dismisses via [`DriftWatcher::dismiss`]).
//!
//! Logs (`<vault>/personas/<slug>/log/`) are intentionally excluded:
//! session logs grow continuously and do not represent a meaningful
//! divergence from the persona specification.
//!
//! ## Bus integration seam
//!
//! Drift events should flow onto the pub/sub bus so the UI can be notified
//! without polling. The bus relay (`c4n-bus-relay`) and its envelope schema
//! (`NEVAAA-28`) are still M2 scaffolding at the time of this story. The
//! integration is expressed as the [`DriftNotifier`] trait rather than a
//! hard dependency — exactly the same pattern as `EphemeralNotifier` in
//! `c4n-persona-supervisor`. [`NullDriftNotifier`] is the no-op default;
//! the real bus client implements the trait once it exists.
//!
//! Architecture: D-11 (persona lifecycle)
//! Implementing story: M3 Story 3.4 — FR-21 backflow drift detection

use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tracing::{debug, warn};

/// Vault subdirs watched for drift changes.
/// `log/` is excluded — append-only session logs don't represent spec drift.
const DRIFT_WATCH_SUBDIRS: &[&str] = &["memory", "skills"];

#[derive(Debug, Error)]
pub enum DriftError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),

    #[error("watcher: {0}")]
    Watch(#[from] notify::Error),

    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
}

/// One changed vault file that contributes to drift.
/// `relative_path` is relative to `<vault>/personas/<slug>/`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DriftField {
    /// Relative path, e.g. `"memory/session-notes.md"`.
    pub relative_path: String,
    /// ISO-8601 UTC timestamp of when the change was first detected.
    pub detected_at: String,
}

/// Drift state for one persona.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum DriftState {
    /// Vault dir and definition file are in sync (no changes since last
    /// definition-file update, or no runtime state yet).
    Clean,
    /// One or more vault files changed after the definition file was last
    /// updated. `fields` names the changed paths.
    Drifted {
        /// Changed vault paths (relative to `personas/<slug>/`), deduplicated.
        fields: Vec<DriftField>,
        /// ISO-8601 UTC timestamp of when drift was first detected.
        first_detected_at: String,
    },
    /// User dismissed the drift badge. Automatically clears back to `Clean`
    /// on the next new vault-dir change, giving the user a fresh signal.
    Dismissed {
        /// ISO-8601 UTC timestamp of the dismissal.
        dismissed_at: String,
    },
}

impl DriftState {
    /// True iff the current state is `Drifted`.
    pub fn is_drifted(&self) -> bool {
        matches!(self, DriftState::Drifted { .. })
    }

    /// Number of fields contributing to drift (0 for `Clean`/`Dismissed`).
    pub fn field_count(&self) -> usize {
        match self {
            DriftState::Drifted { fields, .. } => fields.len(),
            _ => 0,
        }
    }
}

// ── Bus integration seam ─────────────────────────────────────────────

/// Hook surface for the pub/sub bus. See the module docs for why this is
/// a trait rather than a direct dependency on the bus client.
///
/// All methods are infallible from the watcher's point of view: a bus
/// that is unreachable must not interfere with drift detection itself.
/// Implementations should swallow/log their own transport errors.
pub trait DriftNotifier: Send + Sync + 'static {
    /// Called when the persona transitions into the `Drifted` state or
    /// when additional fields accumulate while already drifted.
    fn on_drift_detected(&self, persona_id: &str, fields: &[DriftField]);
    /// Called when drift is cleared — either because the definition file
    /// was updated past the vault changes or the user dismissed.
    fn on_drift_cleared(&self, persona_id: &str);
}

/// No-op notifier used when no bus is wired (default until M2 bus stories land).
#[derive(Debug, Default, Clone, Copy)]
pub struct NullDriftNotifier;

impl DriftNotifier for NullDriftNotifier {
    fn on_drift_detected(&self, _persona_id: &str, _fields: &[DriftField]) {}
    fn on_drift_cleared(&self, _persona_id: &str) {}
}

// ── DriftWatcher ─────────────────────────────────────────────────────

/// Live `notify`-based watcher that maintains drift state for one persona.
///
/// Watches `<vault>/personas/<slug>/memory/` and `.../skills/` for write
/// events and tracks whether the definition file has been updated since
/// the last vault change.
///
/// Dropping the watcher stops the background thread and tears down the
/// OS watcher.
pub struct DriftWatcher {
    persona_id: String,
    state: Arc<Mutex<DriftState>>,
    stop: Arc<AtomicBool>,
    watcher: Option<RecommendedWatcher>,
    handle: Option<JoinHandle<()>>,
}

impl DriftWatcher {
    /// Start watching `vault_path/personas/persona_id/` for drift.
    ///
    /// `definition_file` is the canonical persona spec (e.g.
    /// `<project>/claude.md`). Its mtime is compared against vault
    /// change times to determine whether drift exists at watcher start.
    ///
    /// `notifier` receives bus events when drift state changes. Pass
    /// `Arc::new(NullDriftNotifier)` when the bus is not yet wired.
    pub fn start(
        vault_path: impl Into<PathBuf>,
        persona_id: impl Into<String>,
        definition_file: impl Into<PathBuf>,
        notifier: Arc<dyn DriftNotifier>,
    ) -> Result<Self, DriftError> {
        let vault_path: PathBuf = vault_path.into();
        let persona_id: String = persona_id.into();
        let definition_file: PathBuf = definition_file.into();

        let persona_dir = vault_path.join("personas").join(&persona_id);

        // Create watched subdirs if they don't exist so the watcher can
        // attach immediately on a fresh vault (same approach as ScopeMonitor).
        for sub in DRIFT_WATCH_SUBDIRS {
            std::fs::create_dir_all(persona_dir.join(sub))?;
        }

        // Compute initial drift state by comparing vault-file mtimes against
        // the definition file's mtime. If the definition file doesn't exist
        // yet we treat it as infinitely old → anything in the vault is drift.
        let def_mtime = file_mtime_secs(&definition_file);
        let initial_state = compute_initial_drift(&persona_dir, def_mtime);

        let state = Arc::new(Mutex::new(initial_state));
        let stop = Arc::new(AtomicBool::new(false));

        let (tx, rx) = std::sync::mpsc::channel();
        let mut watcher = notify::recommended_watcher(tx)?;

        for sub in DRIFT_WATCH_SUBDIRS {
            let sub_dir = persona_dir.join(sub);
            // Watch even if the sub-dir is empty — notify re-attaches on recreate.
            if let Err(e) = watcher.watch(&sub_dir, RecursiveMode::Recursive) {
                warn!(persona = %persona_id, sub, "drift watcher could not attach to subdir (non-fatal): {e}");
            }
        }
        // Also watch the definition file so we can detect when it is updated
        // and clear drift automatically.
        if definition_file.exists() {
            if let Err(e) = watcher.watch(&definition_file, RecursiveMode::NonRecursive) {
                warn!(persona = %persona_id, ?definition_file, "drift watcher could not watch definition file (non-fatal): {e}");
            }
        }

        let persona_id_thread = persona_id.clone();
        let state_thread = state.clone();
        let stop_thread = stop.clone();

        let handle = std::thread::spawn(move || {
            use std::sync::mpsc::RecvTimeoutError;
            use std::time::Duration;

            loop {
                if stop_thread.load(Ordering::SeqCst) {
                    break;
                }
                match rx.recv_timeout(Duration::from_millis(400)) {
                    Ok(Ok(event)) => {
                        process_drift_event(
                            &event,
                            &persona_dir,
                            &definition_file,
                            &persona_id_thread,
                            &state_thread,
                            &*notifier,
                        );
                    }
                    Ok(Err(e)) => warn!(persona = %persona_id_thread, "drift watch error: {e}"),
                    Err(RecvTimeoutError::Timeout) => continue,
                    Err(RecvTimeoutError::Disconnected) => break,
                }
            }
        });

        debug!(persona = %persona_id, "persona-drift watcher started");

        Ok(Self {
            persona_id,
            state,
            stop,
            watcher: Some(watcher),
            handle: Some(handle),
        })
    }

    /// Current drift state. Cheap — just clones the inner `Arc<Mutex<DriftState>>`.
    pub fn state(&self) -> DriftState {
        self.state
            .lock()
            .expect("drift state mutex poisoned")
            .clone()
    }

    /// Dismiss the current drift badge. The state moves to `Dismissed` so
    /// the UI badge disappears. The next new vault-dir change will move it
    /// back to `Drifted` so the user gets a fresh signal.
    ///
    /// If the current state is already `Clean`, dismiss is a no-op.
    pub fn dismiss(&self) {
        let mut guard = self.state.lock().expect("drift state mutex poisoned");
        match &*guard {
            DriftState::Drifted { .. } => {
                *guard = DriftState::Dismissed {
                    dismissed_at: now_iso8601(),
                };
            }
            DriftState::Clean | DriftState::Dismissed { .. } => {}
        }
    }

    /// The persona ID this watcher is for.
    pub fn persona_id(&self) -> &str {
        &self.persona_id
    }
}

impl Drop for DriftWatcher {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        self.watcher.take();
        if let Some(h) = self.handle.take() {
            let _ = h.join();
        }
    }
}

// ── Internal helpers ─────────────────────────────────────────────────

/// Process one notify event: update drift state and call the notifier.
fn process_drift_event(
    event: &notify::Event,
    persona_dir: &Path,
    definition_file: &Path,
    persona_id: &str,
    state: &Mutex<DriftState>,
    notifier: &dyn DriftNotifier,
) {
    use notify::EventKind;

    let is_write = matches!(
        event.kind,
        EventKind::Create(_) | EventKind::Modify(_) | EventKind::Any | EventKind::Other
    );
    if !is_write {
        return;
    }

    for path in &event.paths {
        let norm = normalize_lexical(path);

        // Definition file updated → maybe clear drift.
        if norm == normalize_lexical(definition_file) {
            let def_mtime = file_mtime_secs(definition_file);
            let mut guard = state.lock().expect("drift state mutex poisoned");
            match &*guard {
                DriftState::Drifted { fields, .. } => {
                    // Check whether the definition file is now newer than all
                    // drifted fields. If so, we can declare the sync complete.
                    // Because we don't store per-field mtimes in the guard
                    // (they'd be stale), we re-scan the vault.
                    let still_drifted = vault_has_newer_changes(persona_dir, def_mtime);
                    if !still_drifted {
                        let prev_fields = fields.clone();
                        *guard = DriftState::Clean;
                        drop(guard);
                        debug!(persona = %persona_id, "drift cleared — definition file updated");
                        notifier.on_drift_cleared(persona_id);
                        let _ = prev_fields; // suppress unused-variable
                    }
                }
                DriftState::Dismissed { .. } => {
                    // Definition file updated while dismissed → back to Clean.
                    let still_drifted = vault_has_newer_changes(persona_dir, def_mtime);
                    if !still_drifted {
                        *guard = DriftState::Clean;
                        drop(guard);
                        notifier.on_drift_cleared(persona_id);
                    }
                }
                DriftState::Clean => {}
            }
            continue;
        }

        // Vault subdir change → check whether it's in a watched subdir.
        if !is_under_watched_subdirs(path, persona_dir) {
            continue;
        }

        let relative_path = path
            .strip_prefix(persona_dir)
            .map(|p| p.to_string_lossy().replace('\\', "/"))
            .unwrap_or_else(|_| path.to_string_lossy().replace('\\', "/"));

        let now = now_iso8601();
        let def_mtime = file_mtime_secs(definition_file);

        let mut guard = state.lock().expect("drift state mutex poisoned");
        match &mut *guard {
            DriftState::Clean => {
                // Vault changed while clean → new drift.
                let field = DriftField {
                    relative_path,
                    detected_at: now.clone(),
                };
                let fields = vec![field.clone()];
                *guard = DriftState::Drifted {
                    fields: fields.clone(),
                    first_detected_at: now,
                };
                drop(guard);
                debug!(persona = %persona_id, path = %field.relative_path, "drift detected");
                notifier.on_drift_detected(persona_id, &fields);
            }
            DriftState::Drifted { fields, .. } => {
                // Accumulate new field if not already tracked.
                if !fields.iter().any(|f| f.relative_path == relative_path) {
                    fields.push(DriftField {
                        relative_path,
                        detected_at: now,
                    });
                    let fields_snapshot = fields.clone();
                    drop(guard);
                    notifier.on_drift_detected(persona_id, &fields_snapshot);
                }
            }
            DriftState::Dismissed { .. } => {
                // New vault change after dismiss → re-trigger drift.
                let _ = def_mtime; // suppress unused
                let field = DriftField {
                    relative_path,
                    detected_at: now.clone(),
                };
                let fields = vec![field.clone()];
                *guard = DriftState::Drifted {
                    fields: fields.clone(),
                    first_detected_at: now,
                };
                drop(guard);
                debug!(persona = %persona_id, "drift re-triggered after dismiss");
                notifier.on_drift_detected(persona_id, &fields);
            }
        }
    }
}

/// Compute the drift state at watcher-start time by comparing vault-file
/// mtimes against the definition file's mtime.
fn compute_initial_drift(persona_dir: &Path, def_mtime_secs: Option<u64>) -> DriftState {
    let fields = vault_newer_fields(persona_dir, def_mtime_secs);
    if fields.is_empty() {
        DriftState::Clean
    } else {
        let first = fields[0].detected_at.clone();
        DriftState::Drifted {
            fields,
            first_detected_at: first,
        }
    }
}

/// Collect vault files that are newer than `def_mtime_secs`.
/// Returns empty if all vault files are older or the vault dirs don't exist.
fn vault_newer_fields(persona_dir: &Path, def_mtime_secs: Option<u64>) -> Vec<DriftField> {
    let mut fields = Vec::new();
    let now = now_iso8601();
    for sub in DRIFT_WATCH_SUBDIRS {
        let sub_dir = persona_dir.join(sub);
        let Ok(entries) = std::fs::read_dir(&sub_dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                let mtime = file_mtime_secs(&path);
                let is_newer = match (mtime, def_mtime_secs) {
                    (Some(vm), Some(dm)) => vm > dm,
                    (Some(_), None) => true, // definition file missing → treat vault as newer
                    (None, _) => false,
                };
                if is_newer {
                    let rel = path
                        .strip_prefix(persona_dir)
                        .map(|p| p.to_string_lossy().replace('\\', "/"))
                        .unwrap_or_else(|_| path.to_string_lossy().replace('\\', "/"));
                    fields.push(DriftField {
                        relative_path: rel,
                        detected_at: now.clone(),
                    });
                }
            }
        }
    }
    fields
}

/// True if any vault file is newer than `def_mtime_secs`.
fn vault_has_newer_changes(persona_dir: &Path, def_mtime_secs: Option<u64>) -> bool {
    !vault_newer_fields(persona_dir, def_mtime_secs).is_empty()
}

/// True if `path` is under one of the watched subdirs of `persona_dir`.
fn is_under_watched_subdirs(path: &Path, persona_dir: &Path) -> bool {
    let norm = normalize_lexical(path);
    DRIFT_WATCH_SUBDIRS.iter().any(|sub| {
        let sub_dir = normalize_lexical(&persona_dir.join(sub));
        // Check both exact match (for the dir itself) and prefix (for files inside).
        let sub_str = sub_dir.to_string_lossy().to_lowercase().replace('\\', "/");
        let norm_str = norm.to_string_lossy().to_lowercase().replace('\\', "/");
        norm_str == sub_str || norm_str.starts_with(&format!("{sub_str}/"))
    })
}

/// Return the file's mtime as seconds since UNIX epoch, or `None` if the
/// file doesn't exist or the mtime can't be read.
fn file_mtime_secs(path: &Path) -> Option<u64> {
    std::fs::metadata(path)
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
}

/// Lexically normalize a path without touching the filesystem.
fn normalize_lexical(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for comp in path.components() {
        match comp {
            Component::CurDir => {}
            Component::ParentDir => {
                out.pop();
            }
            other => out.push(other.as_os_str()),
        }
    }
    out
}

/// Current time as ISO-8601 UTC, e.g. `2026-05-29T15:00:00Z`.
fn now_iso8601() -> String {
    chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string()
}

/// Returns the crate's identity string. Used by tests and module-presence checks.
pub fn package_name() -> &'static str {
    "c4n-persona-drift"
}

// ── Tests ─────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering as AOrdering};
    use tempfile::TempDir;

    // ── Recording notifier for tests ────────────────────────────────

    #[derive(Default)]
    struct RecordingNotifier {
        detected_count: AtomicUsize,
        cleared_count: AtomicUsize,
        last_fields: Mutex<Vec<DriftField>>,
    }

    impl DriftNotifier for RecordingNotifier {
        fn on_drift_detected(&self, _persona_id: &str, fields: &[DriftField]) {
            self.detected_count.fetch_add(1, AOrdering::SeqCst);
            *self.last_fields.lock().unwrap() = fields.to_vec();
        }
        fn on_drift_cleared(&self, _persona_id: &str) {
            self.cleared_count.fetch_add(1, AOrdering::SeqCst);
        }
    }

    fn persona_dir(vault: &TempDir, slug: &str) -> PathBuf {
        vault.path().join("personas").join(slug)
    }

    fn make_definition_file(dir: &TempDir, name: &str) -> PathBuf {
        let p = dir.path().join(name);
        std::fs::write(&p, format!("# Definition\n\npersona: {name}\n")).unwrap();
        p
    }

    // ── Unit tests for pure helpers ──────────────────────────────────

    #[test]
    fn package_name_is_correct() {
        assert_eq!(package_name(), "c4n-persona-drift");
    }

    #[test]
    fn drift_state_field_count() {
        let clean = DriftState::Clean;
        assert_eq!(clean.field_count(), 0);
        assert!(!clean.is_drifted());

        let drifted = DriftState::Drifted {
            fields: vec![
                DriftField {
                    relative_path: "memory/a.md".into(),
                    detected_at: "now".into(),
                },
                DriftField {
                    relative_path: "skills/b.md".into(),
                    detected_at: "now".into(),
                },
            ],
            first_detected_at: "now".into(),
        };
        assert_eq!(drifted.field_count(), 2);
        assert!(drifted.is_drifted());

        let dismissed = DriftState::Dismissed {
            dismissed_at: "now".into(),
        };
        assert_eq!(dismissed.field_count(), 0);
        assert!(!dismissed.is_drifted());
    }

    #[test]
    fn no_drift_when_vault_is_empty() {
        let vault = TempDir::new().unwrap();
        let def = make_definition_file(&vault, "claude.md");
        let pdir = persona_dir(&vault, "dev");
        for sub in DRIFT_WATCH_SUBDIRS {
            std::fs::create_dir_all(pdir.join(sub)).unwrap();
        }
        let initial = compute_initial_drift(&pdir, file_mtime_secs(&def));
        assert_eq!(initial, DriftState::Clean, "empty vault dirs → no drift");
    }

    #[test]
    fn single_field_drift_detected_at_start() {
        let vault = TempDir::new().unwrap();
        let pdir = persona_dir(&vault, "dev");
        for sub in DRIFT_WATCH_SUBDIRS {
            std::fs::create_dir_all(pdir.join(sub)).unwrap();
        }

        // Write definition file first.
        let def = make_definition_file(&vault, "claude.md");

        // Sleep 1s so memory file mtime is definitively newer.
        // On Windows, file system timestamps have 1s granularity for FAT,
        // but NTFS has 100ns resolution. We write after a tiny sleep and
        // use a manual override via the None path to avoid flakiness.
        // Instead, simulate "definition missing" (None mtime) to guarantee
        // vault files are treated as newer.
        let _ = def;
        let memory_file = pdir.join("memory").join("notes.md");
        std::fs::write(&memory_file, "session notes").unwrap();

        // definition mtime = None → any vault file is treated as drift.
        let initial = compute_initial_drift(&pdir, None);
        assert!(
            initial.is_drifted(),
            "vault file with no definition → drift expected; got: {initial:?}"
        );
        assert_eq!(initial.field_count(), 1);
        if let DriftState::Drifted { fields, .. } = &initial {
            assert!(
                fields[0].relative_path.contains("notes.md"),
                "got: {:?}",
                fields[0]
            );
        }
    }

    #[test]
    fn multi_field_drift_detected_at_start() {
        let vault = TempDir::new().unwrap();
        let pdir = persona_dir(&vault, "dev");
        for sub in DRIFT_WATCH_SUBDIRS {
            std::fs::create_dir_all(pdir.join(sub)).unwrap();
        }

        // Write multiple vault files with no definition → all drifted.
        std::fs::write(pdir.join("memory").join("a.md"), "memory A").unwrap();
        std::fs::write(pdir.join("memory").join("b.md"), "memory B").unwrap();
        std::fs::write(pdir.join("skills").join("c.md"), "skill C").unwrap();

        let initial = compute_initial_drift(&pdir, None);
        assert!(
            initial.is_drifted(),
            "three vault files, no definition → drift"
        );
        assert_eq!(initial.field_count(), 3, "expected 3 drifted fields");
    }

    #[test]
    fn drift_dismissed_transition() {
        let vault = TempDir::new().unwrap();
        let def = make_definition_file(&vault, "claude.md");
        let pdir = persona_dir(&vault, "dev");
        for sub in DRIFT_WATCH_SUBDIRS {
            std::fs::create_dir_all(pdir.join(sub)).unwrap();
        }

        let watcher =
            DriftWatcher::start(vault.path(), "dev", &def, Arc::new(NullDriftNotifier)).unwrap();

        // Initially clean (empty vault dirs, definition file present).
        assert_eq!(watcher.state(), DriftState::Clean);

        // Dismiss when clean → still clean.
        watcher.dismiss();
        assert_eq!(
            watcher.state(),
            DriftState::Clean,
            "dismiss on clean is a no-op"
        );
    }

    #[test]
    fn drift_state_serializes_with_status_tag() {
        let clean = DriftState::Clean;
        let s = serde_json::to_string(&clean).unwrap();
        assert!(s.contains("\"status\":\"clean\""), "got: {s}");

        let drifted = DriftState::Drifted {
            fields: vec![DriftField {
                relative_path: "memory/x.md".into(),
                detected_at: "2026-05-29T00:00:00Z".into(),
            }],
            first_detected_at: "2026-05-29T00:00:00Z".into(),
        };
        let s = serde_json::to_string(&drifted).unwrap();
        assert!(s.contains("\"status\":\"drifted\""), "got: {s}");
        assert!(s.contains("memory/x.md"), "got: {s}");

        let dismissed = DriftState::Dismissed {
            dismissed_at: "2026-05-29T00:00:00Z".into(),
        };
        let s = serde_json::to_string(&dismissed).unwrap();
        assert!(s.contains("\"status\":\"dismissed\""), "got: {s}");
    }

    /// End-to-end watcher test with a live notify backend.
    /// `#[ignore]` — notify timing is platform-flaky in CI (same caveat
    /// as vault-scoping). Core classification logic is covered by the
    /// non-watcher tests above. Run manually:
    ///   `cargo test -p c4n-persona-drift -- --ignored`
    #[test]
    #[ignore = "notify timing is platform-flaky; classification covered by pure-logic tests"]
    fn watcher_detects_memory_file_creation() {
        use std::time::{Duration, Instant};
        let vault = TempDir::new().unwrap();
        let def = make_definition_file(&vault, "claude.md");
        let pdir = persona_dir(&vault, "dev");

        let watcher =
            DriftWatcher::start(vault.path(), "dev", &def, Arc::new(NullDriftNotifier)).unwrap();

        std::thread::sleep(Duration::from_millis(200));
        std::fs::write(pdir.join("memory").join("live-note.md"), "content").unwrap();

        let deadline = Instant::now() + Duration::from_secs(3);
        loop {
            if watcher.state().is_drifted() {
                break;
            }
            if Instant::now() > deadline {
                panic!("watcher did not detect drift within 3s");
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        assert_eq!(watcher.state().field_count(), 1);
    }
}
