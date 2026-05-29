//! c4n-vault-scoping — Per-persona vault write logger (D-7, FR-29).
//!
//! Each persona owns a scoped slice of the vault:
//!   - its own directory `vault/personas/<persona-id>/`
//!   - the shared project area `vault/projects/<project-id>/` for any
//!     project it's attached to.
//!
//! Writes outside that slice are **logged but never blocked** — FR-29 is
//! explicit that M3 is observability only; hard sandboxing is deferred to
//! a future story (N-4). This crate provides:
//!
//!   1. [`ScopeGuard`] — pure classification of "is this path in scope?"
//!   2. [`OutOfScopeEntry`] + [`ScopeGuard::log_out_of_scope_write`] —
//!      JSON-lines logging to `vault/personas/<persona-id>/out-of-scope-writes.log`,
//!      matching the schema pinned in `docs/vault-layout.md`.
//!   3. [`ScopeMonitor`] — a `notify`-based watcher (D-4) that feeds live
//!      filesystem write events through the guard and logs the violations.
//!
//! ## Best-effort attribution caveat
//!
//! A filesystem watcher sees *that* a path changed, not *which process*
//! changed it. A `ScopeMonitor` configured for persona `dev` therefore
//! attributes every out-of-scope write it observes to `dev`, even if
//! another persona's process actually made it. This is the documented
//! best-effort limitation of FR-29 — real per-process attribution needs
//! syscall-level sandboxing (N-4). In the common case (one active persona
//! writing across the vault) the attribution is correct; with several
//! personas writing concurrently the log may over-report. Treat the log
//! as a signal, not proof.
//!
//! Architecture: D-7
//! Implementing stories: M3 Story 3.5

use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::JoinHandle;

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tracing::{debug, warn};

/// Filename appended to a persona's vault dir for out-of-scope writes.
const OUT_OF_SCOPE_LOG_FILENAME: &str = "out-of-scope-writes.log";

#[derive(Debug, Error)]
pub enum ScopingError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),

    #[error("json: {0}")]
    Json(#[from] serde_json::Error),

    #[error("watcher: {0}")]
    Watch(#[from] notify::Error),
}

/// Kind of write that triggered a scope check. Maps from `notify`'s
/// event kinds; serialized lowercase to match `docs/vault-layout.md`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WriteType {
    /// A new file or directory was created.
    Create,
    /// An existing path was modified (content or metadata).
    Modify,
    /// A path was removed.
    Remove,
}

impl WriteType {
    /// Classify a `notify` event kind. Returns `None` for non-write
    /// events (e.g. access/open) which shouldn't be logged as writes.
    fn from_event_kind(kind: &notify::EventKind) -> Option<Self> {
        use notify::EventKind;
        match kind {
            EventKind::Create(_) => Some(WriteType::Create),
            EventKind::Modify(_) => Some(WriteType::Modify),
            EventKind::Remove(_) => Some(WriteType::Remove),
            // `Access` is a read, not a write — never logged. `Any`/`Other`
            // are platform-fuzzy; treat them conservatively as a modify so
            // a real write isn't silently dropped on backends that don't
            // distinguish kinds.
            EventKind::Any | EventKind::Other => Some(WriteType::Modify),
            EventKind::Access(_) => None,
        }
    }
}

/// One JSON-lines entry in `out-of-scope-writes.log`. Schema matches
/// `docs/vault-layout.md` § `out-of-scope-writes.log`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutOfScopeEntry {
    /// ISO-8601 UTC timestamp (e.g. `2026-05-29T15:00:00Z`).
    pub ts: String,
    /// The path the persona attempted to write, as observed.
    pub attempted_path: String,
    /// What kind of write it was.
    pub write_type: WriteType,
    /// Which persona the monitor attributes the write to. Best-effort —
    /// see the crate-level "attribution caveat".
    pub caller_persona_id: String,
}

/// Pure scope classifier + violation logger for a single persona.
///
/// Cloneable so the same scope rules can back both a `ScopeMonitor` and
/// ad-hoc classification calls.
#[derive(Debug, Clone)]
pub struct ScopeGuard {
    vault_root: PathBuf,
    persona_id: String,
    /// Project IDs whose shared area (`vault/projects/<id>/`) this persona
    /// may write to. Empty means "own persona dir only".
    project_ids: Vec<String>,
}

impl ScopeGuard {
    /// Build a guard for `persona_id` rooted at `vault_root`, allowing
    /// writes to the shared area of each project in `project_ids`.
    pub fn new(
        vault_root: impl Into<PathBuf>,
        persona_id: impl Into<String>,
        project_ids: impl IntoIterator<Item = String>,
    ) -> Self {
        Self {
            vault_root: vault_root.into(),
            persona_id: persona_id.into(),
            project_ids: project_ids.into_iter().collect(),
        }
    }

    /// The persona this guard is for.
    pub fn persona_id(&self) -> &str {
        &self.persona_id
    }

    /// The persona's own scoped directory: `vault/personas/<persona-id>/`.
    pub fn persona_dir(&self) -> PathBuf {
        self.vault_root.join("personas").join(&self.persona_id)
    }

    /// Path of this persona's out-of-scope write log.
    pub fn log_path(&self) -> PathBuf {
        self.persona_dir().join(OUT_OF_SCOPE_LOG_FILENAME)
    }

    /// All directories the persona is allowed to write under.
    fn allowed_roots(&self) -> Vec<PathBuf> {
        let mut roots = vec![self.persona_dir()];
        for pid in &self.project_ids {
            roots.push(self.vault_root.join("projects").join(pid));
        }
        roots
    }

    /// Is `path` inside one of this persona's allowed scope roots?
    ///
    /// Comparison is lexical (resolves `.`/`..` without touching the
    /// filesystem) so it works for paths that don't exist yet — e.g. a
    /// `Create` event for a file the watcher reports before we can stat it.
    pub fn is_in_scope(&self, path: impl AsRef<Path>) -> bool {
        let norm = normalize_lexical(path.as_ref());
        self.allowed_roots()
            .iter()
            .any(|root| starts_with_normalized(&norm, root))
    }

    /// Classify `path`; if it's out of scope, append a log entry and
    /// return `Ok(true)`. In-scope paths return `Ok(false)` and write
    /// nothing. Never blocks — per FR-29 this is observability only.
    pub fn classify_and_log(
        &self,
        path: impl AsRef<Path>,
        write_type: WriteType,
    ) -> Result<bool, ScopingError> {
        let path = path.as_ref();
        if self.is_in_scope(path) {
            return Ok(false);
        }
        self.log_out_of_scope_write(path, write_type)?;
        Ok(true)
    }

    /// Append an out-of-scope entry for `path` to this persona's log.
    /// Callers that have already classified the write use this directly;
    /// most callers want [`ScopeGuard::classify_and_log`].
    pub fn log_out_of_scope_write(
        &self,
        path: impl AsRef<Path>,
        write_type: WriteType,
    ) -> Result<(), ScopingError> {
        let entry = OutOfScopeEntry {
            ts: now_iso8601(),
            attempted_path: path.as_ref().to_string_lossy().to_string(),
            write_type,
            caller_persona_id: self.persona_id.clone(),
        };
        append_entry(&self.log_path(), &entry)
    }
}

/// Append a single JSON-lines entry to `log_path`, creating the parent
/// directory and file if needed. JSON-lines (one compact object per line),
/// not pretty-printed, per the vault-layout convention for `*.log` files.
fn append_entry(log_path: &Path, entry: &OutOfScopeEntry) -> Result<(), ScopingError> {
    use std::io::Write;
    if let Some(parent) = log_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)?;
    let json = serde_json::to_string(entry)?;
    writeln!(file, "{json}")?;
    file.flush()?;
    Ok(())
}

/// Current time as an ISO-8601 UTC string, e.g. `2026-05-29T15:00:00Z`.
fn now_iso8601() -> String {
    chrono::Utc::now()
        .format("%Y-%m-%dT%H:%M:%SZ")
        .to_string()
}

/// Lexically normalize a path: drop `.` components and resolve `..` by
/// popping. Does NOT touch the filesystem, so it's safe for paths that
/// don't exist yet and for watcher events about already-removed files.
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

/// `child.starts_with(root)`, but case-insensitive on Windows where the
/// filesystem is case-insensitive and watcher/derived paths can disagree
/// on case. `root` is normalized by the caller; we normalize the compare.
fn starts_with_normalized(child: &Path, root: &Path) -> bool {
    let root = normalize_lexical(root);
    if child.starts_with(&root) {
        return true;
    }
    if cfg!(windows) {
        let c = child.to_string_lossy().to_lowercase();
        let r = root.to_string_lossy().to_lowercase();
        // Compare on normalized separators so `\` vs `/` never matters.
        let c = c.replace('\\', "/");
        let r = r.replace('\\', "/");
        return c == r || c.starts_with(&format!("{r}/"));
    }
    false
}

/// Live `notify`-based watcher that logs out-of-scope writes for a persona.
///
/// Watches `vault/personas/` and `vault/projects/` recursively and runs
/// every observed write through the [`ScopeGuard`]. Dropping the monitor
/// stops the background thread and tears down the OS watcher.
///
/// See the crate-level "attribution caveat": the monitor attributes every
/// out-of-scope write it sees to its configured persona.
pub struct ScopeMonitor {
    // Field order matters for Drop: signal the thread, then drop the
    // watcher (closes the channel), then join. We do this explicitly in
    // `Drop` rather than relying on field drop order.
    stop: Arc<AtomicBool>,
    watcher: Option<RecommendedWatcher>,
    handle: Option<JoinHandle<()>>,
}

impl ScopeMonitor {
    /// Start watching the vault for out-of-scope writes by `guard`'s
    /// persona. Creates the `personas/` and `projects/` roots if missing
    /// so the watch can attach immediately on a fresh vault.
    pub fn start(guard: ScopeGuard) -> Result<Self, ScopingError> {
        let personas_dir = guard.vault_root.join("personas");
        let projects_dir = guard.vault_root.join("projects");
        std::fs::create_dir_all(&personas_dir)?;
        std::fs::create_dir_all(&projects_dir)?;

        let (tx, rx) = std::sync::mpsc::channel();
        let mut watcher = notify::recommended_watcher(tx)?;
        watcher.watch(&personas_dir, RecursiveMode::Recursive)?;
        watcher.watch(&projects_dir, RecursiveMode::Recursive)?;

        let persona_label = guard.persona_id.clone();
        let stop = Arc::new(AtomicBool::new(false));
        let stop_thread = stop.clone();
        let handle = std::thread::spawn(move || {
            use std::sync::mpsc::RecvTimeoutError;
            use std::time::Duration;
            loop {
                if stop_thread.load(Ordering::SeqCst) {
                    break;
                }
                match rx.recv_timeout(Duration::from_millis(400)) {
                    Ok(Ok(event)) => process_event(&guard, &event),
                    Ok(Err(e)) => warn!("vault-scoping watch error: {e}"),
                    Err(RecvTimeoutError::Timeout) => continue,
                    Err(RecvTimeoutError::Disconnected) => break,
                }
            }
        });

        debug!(persona = %persona_label, "vault-scoping monitor started");

        Ok(Self {
            stop,
            watcher: Some(watcher),
            handle: Some(handle),
        })
    }
}

/// Run one watcher event through the guard, logging each out-of-scope path.
fn process_event(guard: &ScopeGuard, event: &notify::Event) {
    let Some(write_type) = WriteType::from_event_kind(&event.kind) else {
        return; // access/read event — not a write
    };
    for path in &event.paths {
        // Never log the persona's own out-of-scope log file (it lives in
        // the persona dir, so it's in-scope anyway — this is belt-and-
        // suspenders against a future scope-root change re-introducing a
        // write-amplification loop).
        if path == &guard.log_path() {
            continue;
        }
        match guard.classify_and_log(path, write_type) {
            Ok(true) => debug!(?path, ?write_type, "logged out-of-scope write"),
            Ok(false) => {}
            Err(e) => warn!("vault-scoping log append failed: {e}"),
        }
    }
}

impl Drop for ScopeMonitor {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        // Drop the watcher first so the channel disconnects and the thread
        // can wake from `recv_timeout` promptly.
        self.watcher.take();
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
        }
    }
}

/// Returns the crate's identity string. Used by tests and module-presence checks.
pub fn package_name() -> &'static str {
    "c4n-vault-scoping"
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn guard_in(dir: &TempDir, persona: &str, projects: &[&str]) -> ScopeGuard {
        ScopeGuard::new(
            dir.path().to_path_buf(),
            persona,
            projects.iter().map(|s| s.to_string()),
        )
    }

    #[test]
    fn package_name_is_correct() {
        assert_eq!(package_name(), "c4n-vault-scoping");
    }

    #[test]
    fn own_persona_dir_is_in_scope() {
        let dir = TempDir::new().unwrap();
        let g = guard_in(&dir, "dev", &[]);
        let p = dir.path().join("personas").join("dev").join("memory").join("note.md");
        assert!(g.is_in_scope(&p));
    }

    #[test]
    fn other_persona_dir_is_out_of_scope() {
        let dir = TempDir::new().unwrap();
        let g = guard_in(&dir, "dev", &[]);
        let p = dir.path().join("personas").join("architect").join("persona.md");
        assert!(!g.is_in_scope(&p));
    }

    #[test]
    fn shared_project_dir_is_in_scope_when_attached() {
        let dir = TempDir::new().unwrap();
        let g = guard_in(&dir, "dev", &["proj-abc"]);
        let p = dir.path().join("projects").join("proj-abc").join("bmad").join("prd.md");
        assert!(g.is_in_scope(&p));
        // A different project's area is NOT in scope.
        let other = dir.path().join("projects").join("proj-xyz").join("x.md");
        assert!(!g.is_in_scope(&other));
    }

    #[test]
    fn parent_dir_traversal_does_not_escape_scope() {
        let dir = TempDir::new().unwrap();
        let g = guard_in(&dir, "dev", &[]);
        // personas/dev/../architect/secret.md normalizes to personas/architect/secret.md
        let sneaky = dir
            .path()
            .join("personas")
            .join("dev")
            .join("..")
            .join("architect")
            .join("secret.md");
        assert!(!g.is_in_scope(&sneaky), "`..` must not be treated as in-scope");
    }

    #[test]
    fn write_type_serializes_lowercase() {
        assert_eq!(serde_json::to_string(&WriteType::Create).unwrap(), "\"create\"");
        assert_eq!(serde_json::to_string(&WriteType::Modify).unwrap(), "\"modify\"");
        assert_eq!(serde_json::to_string(&WriteType::Remove).unwrap(), "\"remove\"");
    }

    #[test]
    fn log_path_is_under_persona_dir() {
        let dir = TempDir::new().unwrap();
        let g = guard_in(&dir, "dev", &[]);
        let lp = g.log_path();
        let s = lp.to_string_lossy().replace('\\', "/");
        assert!(s.ends_with("personas/dev/out-of-scope-writes.log"), "got: {s}");
    }

    #[test]
    fn classify_and_log_writes_only_for_out_of_scope() {
        let dir = TempDir::new().unwrap();
        let g = guard_in(&dir, "dev", &[]);

        // In-scope: returns false, writes nothing.
        let in_scope = dir.path().join("personas").join("dev").join("memory.md");
        assert_eq!(g.classify_and_log(&in_scope, WriteType::Modify).unwrap(), false);
        assert!(!g.log_path().exists(), "in-scope write must not create the log");

        // Out-of-scope: returns true, appends one JSONL entry.
        let out = dir.path().join("personas").join("architect").join("persona.md");
        assert_eq!(g.classify_and_log(&out, WriteType::Create).unwrap(), true);

        let body = std::fs::read_to_string(g.log_path()).unwrap();
        let lines: Vec<&str> = body.trim_end().split('\n').collect();
        assert_eq!(lines.len(), 1);
        let entry: OutOfScopeEntry = serde_json::from_str(lines[0]).unwrap();
        assert_eq!(entry.caller_persona_id, "dev");
        assert_eq!(entry.write_type, WriteType::Create);
        assert!(entry.attempted_path.replace('\\', "/").contains("personas/architect/persona.md"));
        // ISO-8601 UTC shape: ends with Z, has a T separator.
        assert!(entry.ts.ends_with('Z') && entry.ts.contains('T'), "ts: {}", entry.ts);
    }

    #[test]
    fn multiple_violations_append_not_overwrite() {
        let dir = TempDir::new().unwrap();
        let g = guard_in(&dir, "dev", &[]);
        let a = dir.path().join("personas").join("architect").join("a.md");
        let b = dir.path().join("projects").join("other").join("b.md");
        g.classify_and_log(&a, WriteType::Create).unwrap();
        g.classify_and_log(&b, WriteType::Remove).unwrap();
        let body = std::fs::read_to_string(g.log_path()).unwrap();
        assert_eq!(body.trim_end().split('\n').count(), 2);
    }

    /// End-to-end watcher test. `#[ignore]` because notify's debounce +
    /// platform backends (esp. Windows ReadDirectoryChangesW) make exact
    /// timing flaky in CI; the classification + logging core above is the
    /// canonical correctness check. Run manually with:
    ///   `cargo test -p c4n-vault-scoping -- --ignored`
    #[test]
    #[ignore = "notify timing is platform-flaky; core logic covered by non-watcher tests"]
    fn monitor_logs_out_of_scope_file_creation() {
        use std::time::{Duration, Instant};
        let dir = TempDir::new().unwrap();
        let g = guard_in(&dir, "dev", &[]);
        let log_path = g.log_path();
        let _monitor = ScopeMonitor::start(g).unwrap();

        // Give the OS watcher a moment to attach.
        std::thread::sleep(Duration::from_millis(300));

        // Another persona writes — out of scope for "dev".
        let other = dir.path().join("personas").join("architect");
        std::fs::create_dir_all(&other).unwrap();
        std::fs::write(other.join("persona.md"), "hi").unwrap();

        // Poll for the log entry up to 3s.
        let deadline = Instant::now() + Duration::from_secs(3);
        loop {
            if log_path.exists() {
                let body = std::fs::read_to_string(&log_path).unwrap();
                if body.contains("persona.md") {
                    break;
                }
            }
            if Instant::now() > deadline {
                panic!("monitor did not log the out-of-scope write within 3s");
            }
            std::thread::sleep(Duration::from_millis(100));
        }
    }
}
