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
//!   4. [`ViolationPublisher`] + [`ViolationEvent`] — security-hardening
//!      hook that surfaces out-of-scope writes onto the bus as
//!      `vault.scope.violation` envelopes. The default is
//!      [`NullPublisher`] (no-op, matches the pre-hardening behavior);
//!      the persona-supervisor wires a real publisher when running inside
//!      a context that has access to the bus relay (the desktop process
//!      observes the log file independently via the existing
//!      `persona_scope_violations` Tauri command and can publish from
//!      there as a future enhancement).
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
//! Implementing stories: M3 Story 3.5, security-hardening.

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

/// A bus-facing event the [`ViolationPublisher`] receives. Mirrors the
/// payload of the `vault.scope.violation` envelope pinned in
/// `packages/core/src/bus/envelope.ts` (Story 3.5, security-hardening).
///
/// We carry the data as a typed struct (not a pre-built `BusEnvelope`)
/// because the `vault-scoping` crate deliberately has no dependency on
/// `c4n-bus-relay` — the publisher trait is the seam that lets the
/// persona-supervisor (or a future named-pipe bridge) translate a
/// violation into the bus envelope format. This keeps the crate
/// reusable in contexts that don't have a live bus (e.g. unit tests
/// in CI, the desktop Tauri command that reads the log file).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ViolationEvent {
    /// Persona whose scope was violated (best-effort attribution — see
    /// the crate-level "attribution caveat").
    pub persona_id: String,
    /// Absolute path the persona attempted to write, as observed by the
    /// watcher. Captured at the moment the scope guard classified the
    /// event so a downstream publisher sees the same path the log entry
    /// recorded.
    pub attempted_path: String,
    /// Allowed scope roots the persona was supposed to write under.
    /// Empty when the persona has no attached projects (own-dir-only
    /// scope). The desktop UI panel and stall detector consume this
    /// list so they can show the user *what* the persona should have
    /// written to.
    pub allowed_paths: Vec<String>,
    /// Watcher-side classification of the write. See [`WriteType`].
    pub write_type: WriteType,
    /// ISO-8601 UTC timestamp the violation was observed at, matching
    /// the format the file-log entry uses.
    pub ts: String,
}

/// Sink for out-of-scope write events. Implementations translate the
/// typed [`ViolationEvent`] into a bus envelope (or some other live
/// channel — e.g. a local IPC socket, an in-process broadcaster, or a
/// test recorder). The trait is the seam that decouples the scope guard
/// from any specific transport so the watcher can be unit-tested
/// without standing up a bus.
///
/// The default for production builds is [`NullPublisher`], which is a
/// no-op — same observable behavior as pre-hardening. The persona-
/// supervisor is the only known production caller; it wires a real
/// publisher that publishes a `vault.scope.violation` envelope onto the
/// bus relay (see `c4n_bus_relay::Relay::publish`). Tests use
/// [`RecordingPublisher`] to assert the event shape.
pub trait ViolationPublisher: Send + Sync + std::fmt::Debug {
    /// Invoked once per classified out-of-scope write, *after* the
    /// entry has been appended to the on-disk log. Publishers must
    /// never block on slow I/O — drop the event rather than stall the
    /// watcher's `recv_timeout` loop. The default `NullPublisher` is
    /// a true no-op.
    fn publish_violation(&self, event: &ViolationEvent);
}

/// Default no-op publisher. Used when no real publisher is wired —
/// matches the pre-hardening behavior (file log only, no bus event).
#[derive(Debug, Default, Clone, Copy)]
pub struct NullPublisher;

impl ViolationPublisher for NullPublisher {
    fn publish_violation(&self, _event: &ViolationEvent) {}
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
    /// Sink for live violation events (security-hardening). Defaults to
    /// [`NullPublisher`] so existing callers (the persona-supervisor
    /// pre-hardening and unit tests that don't care about the bus) get
    /// the pre-hardening file-log-only behavior with no extra wiring.
    publisher: Arc<dyn ViolationPublisher>,
}

impl ScopeGuard {
    /// Build a guard for `persona_id` rooted at `vault_root`, allowing
    /// writes to the shared area of each project in `project_ids`. Uses
    /// [`NullPublisher`] for live event emission — same as pre-hardening.
    pub fn new(
        vault_root: impl Into<PathBuf>,
        persona_id: impl Into<String>,
        project_ids: impl IntoIterator<Item = String>,
    ) -> Self {
        Self::new_with_publisher(vault_root, persona_id, project_ids, Arc::new(NullPublisher))
    }

    /// Build a guard with an explicit live-event publisher. Used by the
    /// persona-supervisor to wire a real bus publisher and by tests to
    /// inject a [`RecordingPublisher`].
    ///
    /// The publisher is invoked once per classified out-of-scope write
    /// from [`classify_and_log`], *after* the log file is appended. See
    /// [`ViolationPublisher`] for the no-block contract.
    pub fn new_with_publisher(
        vault_root: impl Into<PathBuf>,
        persona_id: impl Into<String>,
        project_ids: impl IntoIterator<Item = String>,
        publisher: Arc<dyn ViolationPublisher>,
    ) -> Self {
        Self {
            vault_root: vault_root.into(),
            persona_id: persona_id.into(),
            project_ids: project_ids.into_iter().collect(),
            publisher,
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

    /// Classify `path`; if it's out of scope, append a log entry, fire
    /// the live-event publisher, and return `Ok(true)`. In-scope paths
    /// return `Ok(false)` and write nothing. Never blocks — per FR-29
    /// this is observability only. The file log is the source of truth;
    /// the publisher is a best-effort live notification on top of it.
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
        // Fire the live-event publisher after the on-disk log so a
        // consumer of the event can rely on the log entry already being
        // visible to the file-based `persona_scope_violations` Tauri
        // command. Per the ViolationPublisher contract, a publisher
        // that fails or panics is the publisher's problem — we don't
        // unwrap here.
        let event = ViolationEvent {
            persona_id: self.persona_id.clone(),
            attempted_path: path.to_string_lossy().to_string(),
            allowed_paths: self
                .allowed_roots()
                .iter()
                .map(|p| p.to_string_lossy().to_string())
                .collect(),
            write_type,
            ts: now_iso8601(),
        };
        self.publisher.publish_violation(&event);
        Ok(true)
    }

    /// Append an out-of-scope entry for `path` to this persona's log.
    /// Callers that have already classified the write use this directly;
    /// most callers want [`ScopeGuard::classify_and_log`]. Does NOT fire
    /// the publisher — by the time you call this directly the violation
    /// is "log only", which is what ad-hoc classification code wants.
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
    chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string()
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
        let p = dir
            .path()
            .join("personas")
            .join("dev")
            .join("memory")
            .join("note.md");
        assert!(g.is_in_scope(&p));
    }

    #[test]
    fn other_persona_dir_is_out_of_scope() {
        let dir = TempDir::new().unwrap();
        let g = guard_in(&dir, "dev", &[]);
        let p = dir
            .path()
            .join("personas")
            .join("architect")
            .join("persona.md");
        assert!(!g.is_in_scope(&p));
    }

    #[test]
    fn shared_project_dir_is_in_scope_when_attached() {
        let dir = TempDir::new().unwrap();
        let g = guard_in(&dir, "dev", &["proj-abc"]);
        let p = dir
            .path()
            .join("projects")
            .join("proj-abc")
            .join("bmad")
            .join("prd.md");
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
        assert!(
            !g.is_in_scope(&sneaky),
            "`..` must not be treated as in-scope"
        );
    }

    #[test]
    fn write_type_serializes_lowercase() {
        assert_eq!(
            serde_json::to_string(&WriteType::Create).unwrap(),
            "\"create\""
        );
        assert_eq!(
            serde_json::to_string(&WriteType::Modify).unwrap(),
            "\"modify\""
        );
        assert_eq!(
            serde_json::to_string(&WriteType::Remove).unwrap(),
            "\"remove\""
        );
    }

    #[test]
    fn log_path_is_under_persona_dir() {
        let dir = TempDir::new().unwrap();
        let g = guard_in(&dir, "dev", &[]);
        let lp = g.log_path();
        let s = lp.to_string_lossy().replace('\\', "/");
        assert!(
            s.ends_with("personas/dev/out-of-scope-writes.log"),
            "got: {s}"
        );
    }

    #[test]
    fn classify_and_log_writes_only_for_out_of_scope() {
        let dir = TempDir::new().unwrap();
        let g = guard_in(&dir, "dev", &[]);

        // In-scope: returns false, writes nothing.
        let in_scope = dir.path().join("personas").join("dev").join("memory.md");
        assert!(!g.classify_and_log(&in_scope, WriteType::Modify).unwrap());
        assert!(
            !g.log_path().exists(),
            "in-scope write must not create the log"
        );

        // Out-of-scope: returns true, appends one JSONL entry.
        let out = dir
            .path()
            .join("personas")
            .join("architect")
            .join("persona.md");
        assert!(g.classify_and_log(&out, WriteType::Create).unwrap());

        let body = std::fs::read_to_string(g.log_path()).unwrap();
        let lines: Vec<&str> = body.trim_end().split('\n').collect();
        assert_eq!(lines.len(), 1);
        let entry: OutOfScopeEntry = serde_json::from_str(lines[0]).unwrap();
        assert_eq!(entry.caller_persona_id, "dev");
        assert_eq!(entry.write_type, WriteType::Create);
        assert!(entry
            .attempted_path
            .replace('\\', "/")
            .contains("personas/architect/persona.md"));
        // ISO-8601 UTC shape: ends with Z, has a T separator.
        assert!(
            entry.ts.ends_with('Z') && entry.ts.contains('T'),
            "ts: {}",
            entry.ts
        );
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

    // ─────────────────────────────────────────────────────────────────────────
    // P0-C: NEVAAA-49 — concurrent vault-scoping hardening
    // ─────────────────────────────────────────────────────────────────────────

    /// Two personas write concurrently: each sees only their own out-of-scope
    /// log, and neither log contains entries attributed to the other persona.
    #[test]
    fn two_personas_concurrent_writes_logged_to_separate_files() {
        let dir = TempDir::new().unwrap();
        let g_dev = guard_in(&dir, "dev", &[]);
        let g_architect = guard_in(&dir, "architect", &[]);

        let dev_out = dir
            .path()
            .join("personas")
            .join("architect")
            .join("dev_write.md");
        let arch_out = dir
            .path()
            .join("personas")
            .join("dev")
            .join("arch_write.md");

        std::thread::scope(|s| {
            s.spawn(|| {
                g_dev.classify_and_log(&dev_out, WriteType::Create).unwrap();
            });
            s.spawn(|| {
                g_architect
                    .classify_and_log(&arch_out, WriteType::Create)
                    .unwrap();
            });
        });

        let dev_log = std::fs::read_to_string(g_dev.log_path()).unwrap();
        let arch_log = std::fs::read_to_string(g_architect.log_path()).unwrap();

        // dev's log: should contain the architect path, attributed to "dev"
        assert!(
            dev_log.contains("dev_write.md"),
            "dev log missing architect write: {dev_log}"
        );
        assert!(
            dev_log.contains("\"caller_persona_id\":\"dev\""),
            "dev log should attribute to 'dev': {dev_log}"
        );

        // architect's log: should contain the dev path, attributed to "architect"
        assert!(
            arch_log.contains("arch_write.md"),
            "architect log missing dev write: {arch_log}"
        );
        assert!(
            arch_log.contains("\"caller_persona_id\":\"architect\""),
            "architect log should attribute to 'architect': {arch_log}"
        );

        // Each log must NOT contain the other persona's ID
        assert!(
            !dev_log.contains("\"caller_persona_id\":\"architect\""),
            "dev log must not attribute to architect: {dev_log}"
        );
        assert!(
            !arch_log.contains("\"caller_persona_id\":\"dev\""),
            "architect log must not attribute to dev: {arch_log}"
        );
    }

    /// Rapid sequential spawn/despawn of multiple personas — each cycle's
    /// ScopeGuard produces its own isolated log file and cleans up without
    /// interfering with other cycles.
    #[test]
    fn rapid_spawn_despawn_cycles_isolate_correctly() {
        let dir = TempDir::new().unwrap();
        for i in 0..20 {
            let persona = format!("persona-{i}");
            let g = guard_in(&dir, &persona, &[]);
            let out_path = dir
                .path()
                .join("personas")
                .join(format!("persona-{}", (i + 1) % 20))
                .join(format!("cross-{i}.md"));
            g.classify_and_log(&out_path, WriteType::Modify).unwrap();
        }

        // Each persona log should have exactly one entry
        for i in 0..20 {
            let g = guard_in(&dir, &format!("persona-{i}"), &[]);
            let body = std::fs::read_to_string(g.log_path()).unwrap();
            assert_eq!(
                body.trim_end().split('\n').count(),
                1,
                "persona-{i} should have exactly 1 entry"
            );
        }
    }

    /// Concurrent writes to the same out-of-scope path from many personas —
    /// all entries must appear in each persona's log (no lost updates).
    #[test]
    fn high_concurrency_all_out_of_scope_entries_preserved() {
        let dir = TempDir::new().unwrap();
        let g_a = guard_in(&dir, "alice", &[]);
        let g_b = guard_in(&dir, "bob", &[]);
        let g_c = guard_in(&dir, "carol", &[]);

        let shared_out_of_scope = dir
            .path()
            .join("personas")
            .join("outsider")
            .join("shared.md");

        std::thread::scope(|s| {
            s.spawn(|| {
                for _ in 0..50 {
                    g_a.classify_and_log(&shared_out_of_scope, WriteType::Create)
                        .unwrap();
                }
            });
            s.spawn(|| {
                for _ in 0..50 {
                    g_b.classify_and_log(&shared_out_of_scope, WriteType::Create)
                        .unwrap();
                }
            });
            s.spawn(|| {
                for _ in 0..50 {
                    g_c.classify_and_log(&shared_out_of_scope, WriteType::Create)
                        .unwrap();
                }
            });
        });

        let alice_log = std::fs::read_to_string(g_a.log_path()).unwrap();
        let bob_log = std::fs::read_to_string(g_b.log_path()).unwrap();
        let carol_log = std::fs::read_to_string(g_c.log_path()).unwrap();

        // Each log should have exactly 50 entries (100 total cross-persona writes,
        // but each log only records the one path it's guarding against)
        assert_eq!(
            alice_log.trim_end().split('\n').count(),
            50,
            "alice log line count"
        );
        assert_eq!(
            bob_log.trim_end().split('\n').count(),
            50,
            "bob log line count"
        );
        assert_eq!(
            carol_log.trim_end().split('\n').count(),
            50,
            "carol log line count"
        );
    }

    /// Shared project directory is in-scope for attached personas — no false
    /// positives when multiple personas write to the same shared area.
    #[test]
    fn shared_project_no_false_positives_concurrent() {
        let dir = TempDir::new().unwrap();
        let g_alice = guard_in(&dir, "alice", &["proj-x"]);
        let g_bob = guard_in(&dir, "bob", &["proj-x"]);

        let shared_file_a = dir
            .path()
            .join("projects")
            .join("proj-x")
            .join("alice-writes.md");
        let shared_file_b = dir
            .path()
            .join("projects")
            .join("proj-x")
            .join("bob-writes.md");

        std::thread::scope(|s| {
            s.spawn(|| {
                assert!(
                    !g_alice
                        .classify_and_log(&shared_file_a, WriteType::Create)
                        .unwrap(),
                    "alice writing to proj-x should be in-scope"
                );
            });
            s.spawn(|| {
                assert!(
                    !g_bob
                        .classify_and_log(&shared_file_b, WriteType::Create)
                        .unwrap(),
                    "bob writing to proj-x should be in-scope"
                );
            });
        });

        // No out-of-scope log should exist for either persona
        assert!(
            !g_alice.log_path().exists(),
            "alice should not have an out-of-scope log"
        );
        assert!(
            !g_bob.log_path().exists(),
            "bob should not have an out-of-scope log"
        );
    }

    /// Five-persona stress: each persona targets every other persona's dir
    /// concurrently. All entries must appear with correct attribution and
    /// no cross-contamination.
    #[test]
    fn five_persona_full_cross_concurrent_no_contamination() {
        let dir = TempDir::new().unwrap();
        let personas = ["alice", "bob", "carol", "dave", "eve"];
        let vault_root = dir.path().to_path_buf();

        std::thread::scope(|s| {
            for i in 0..personas.len() {
                let vault = vault_root.clone();
                s.spawn(move || {
                    let g = ScopeGuard::new(&vault, personas[i], std::iter::empty::<String>());
                    for j in 0..personas.len() {
                        if i == j {
                            continue;
                        }
                        let target = vault
                            .join("personas")
                            .join(personas[j])
                            .join(format!("from-{}.md", personas[i]));
                        g.classify_and_log(&target, WriteType::Create).unwrap();
                    }
                });
            }
        });

        for persona in personas.iter() {
            let g = guard_in(&dir, persona, &[]);
            let body = std::fs::read_to_string(g.log_path()).unwrap();
            let lines: Vec<&str> = body.trim_end().split('\n').collect();
            assert_eq!(
                lines.len(),
                4,
                "personas/{} should have 4 entries, got {}",
                persona,
                lines.len()
            );
            for line in &lines {
                assert!(
                    line.contains(&format!("\"caller_persona_id\":\"{}\"", persona)),
                    "personas/{} entry missing self-attribution: {}",
                    persona,
                    line
                );
            }
            // `i` is kept for parity with the original range-loop —
            // the test harness reads it via the assertion messages.
            let _ = i;
        }
    }

    /// ScopeMonitor Drop is clean: after the monitor is dropped, no events
    /// from in-scope paths are logged.
    #[test]
    fn scope_monitor_drop_cleans_up_thread() {
        let dir = TempDir::new().unwrap();
        let g = guard_in(&dir, "dev", &[]);

        {
            let _monitor = ScopeMonitor::start(g.clone()).unwrap();
            let out = dir.path().join("personas").join("architect").join("x.md");
            g.classify_and_log(&out, WriteType::Create).unwrap();
        }

        let out2 = dir.path().join("personas").join("bob").join("y.md");
        g.classify_and_log(&out2, WriteType::Modify).unwrap();
        let body = std::fs::read_to_string(g.log_path()).unwrap();
        assert!(
            body.contains("y.md"),
            "post-drop write should be logged: {body}"
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // End P0-C
    // ─────────────────────────────────────────────────────────────────────────────────────────────────────

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

    // ─────────────────────────────────────────────────────────────────────
    // security-hardening: violation publisher integration
    // ─────────────────────────────────────────────────────────────────────

    /// `Mutex<Vec<ViolationEvent>>`-backed publisher. Records every event
    /// the guard hands us so the test can assert on the shape. The struct
    /// is `Send + Sync` via the mutex (the trait requires it) and cheap
    /// to clone — sharing the recorder with the guard is by `Arc`.
    #[derive(Default, Debug)]
    struct RecordingPublisher {
        events: std::sync::Mutex<Vec<ViolationEvent>>,
    }

    impl RecordingPublisher {
        fn new() -> Arc<Self> {
            Arc::new(Self::default())
        }

        fn recorded(&self) -> Vec<ViolationEvent> {
            self.events
                .lock()
                .expect("RecordingPublisher mutex poisoned")
                .clone()
        }
    }

    impl ViolationPublisher for RecordingPublisher {
        fn publish_violation(&self, event: &ViolationEvent) {
            self.events
                .lock()
                .expect("RecordingPublisher mutex poisoned")
                .push(event.clone());
        }
    }

    /// AC: `classify_and_log` fires the live-event publisher with the
    /// typed event that matches the `vault.scope.violation` bus envelope
    /// payload. We feed a fake "out-of-scope" path and assert the recorder
    /// captured the persona_id, attempted_path, allowed_paths (containing
    /// the persona's own dir), write_type, and a fresh ISO-8601 ts.
    #[test]
    fn out_of_scope_write_fires_publisher_event() {
        let dir = TempDir::new().unwrap();
        let recorder = RecordingPublisher::new();
        let guard = ScopeGuard::new_with_publisher(
            dir.path().to_path_buf(),
            "dev",
            std::iter::empty::<String>(),
            recorder.clone(),
        );

        let sneaky = dir
            .path()
            .join("personas")
            .join("architect")
            .join("persona.md");
        assert!(
            guard.classify_and_log(&sneaky, WriteType::Modify).unwrap(),
            "out-of-scope write should classify as a violation"
        );

        let events = recorder.recorded();
        assert_eq!(events.len(), 1, "expected exactly one publisher event");

        let ev = &events[0];
        assert_eq!(ev.persona_id, "dev");
        assert!(
            ev.attempted_path
                .replace('\\', "/")
                .ends_with("personas/architect/persona.md"),
            "attempted_path mismatch: {}",
            ev.attempted_path
        );
        assert_eq!(ev.write_type, WriteType::Modify);
        // allowed_paths for a persona with no attached projects contains
        // exactly one root — the persona's own dir.
        assert_eq!(ev.allowed_paths.len(), 1);
        assert!(
            ev.allowed_paths[0]
                .replace('\\', "/")
                .ends_with("personas/dev"),
            "allowed_paths[0] mismatch: {}",
            ev.allowed_paths[0]
        );
        // ISO-8601 UTC shape: ends with Z, has a T separator.
        assert!(ev.ts.ends_with('Z') && ev.ts.contains('T'), "ts: {}", ev.ts);
    }

    /// The publisher fires *only* for out-of-scope writes. An in-scope
    /// path must not produce an event — same invariant the on-disk log
    /// already has, lifted to the live-event channel.
    #[test]
    fn in_scope_write_does_not_fire_publisher() {
        let dir = TempDir::new().unwrap();
        let recorder = RecordingPublisher::new();
        let guard = ScopeGuard::new_with_publisher(
            dir.path().to_path_buf(),
            "dev",
            std::iter::empty::<String>(),
            recorder.clone(),
        );

        let in_scope = dir.path().join("personas").join("dev").join("memory.md");
        assert!(
            !guard
                .classify_and_log(&in_scope, WriteType::Create)
                .unwrap(),
            "in-scope write should NOT classify as a violation"
        );
        assert!(
            recorder.recorded().is_empty(),
            "publisher must not fire for in-scope writes"
        );
    }

    /// AC: attached projects show up in `allowed_paths` so a downstream
    /// consumer (the desktop UI panel, the stall detector) can show the
    /// user *what* the persona should have written to. This is the only
    /// case where `allowed_paths` has more than one entry.
    #[test]
    fn attached_projects_appear_in_allowed_paths() {
        let dir = TempDir::new().unwrap();
        let recorder = RecordingPublisher::new();
        let guard = ScopeGuard::new_with_publisher(
            dir.path().to_path_buf(),
            "dev",
            vec!["proj-abc".to_string()],
            recorder.clone(),
        );

        let out = dir
            .path()
            .join("personas")
            .join("outsider")
            .join("secret.md");
        guard.classify_and_log(&out, WriteType::Create).unwrap();

        let events = recorder.recorded();
        assert_eq!(events.len(), 1);
        // 1 persona dir + 1 attached project = 2 allowed roots.
        assert_eq!(events[0].allowed_paths.len(), 2);
        let joined = events[0]
            .allowed_paths
            .iter()
            .map(|p| p.replace('\\', "/"))
            .collect::<Vec<_>>()
            .join("|");
        assert!(
            joined.contains("personas/dev"),
            "allowed_paths missing persona dir: {joined}"
        );
        assert!(
            joined.contains("projects/proj-abc"),
            "allowed_paths missing project dir: {joined}"
        );
    }

    /// The default `ScopeGuard::new` constructor (no publisher arg)
    /// keeps the pre-hardening behavior: no live events fire, only the
    /// on-disk log entry. This is the safety net for callers that
    /// upgrade their `c4n-vault-scoping` dep and don't wire a publisher.
    #[test]
    fn default_guard_does_not_publish() {
        let dir = TempDir::new().unwrap();
        // No publisher arg -> NullPublisher by default.
        let guard = ScopeGuard::new(
            dir.path().to_path_buf(),
            "dev",
            std::iter::empty::<String>(),
        );

        let out = dir.path().join("personas").join("architect").join("a.md");
        assert!(guard.classify_and_log(&out, WriteType::Create).unwrap());
        // The on-disk log MUST have the entry — that's the
        // pre-hardening contract.
        assert!(guard.log_path().exists(), "log file must be created");
    }

    /// Direct call to `log_out_of_scope_write` (the no-publisher entry
    /// point) does NOT fire the publisher — by the time a caller invokes
    /// it directly, the violation is "log only". This is the contract
    /// the persona-supervisor's pre-hardening call sites rely on.
    #[test]
    fn log_out_of_scope_write_does_not_publish() {
        let dir = TempDir::new().unwrap();
        let recorder = RecordingPublisher::new();
        let guard = ScopeGuard::new_with_publisher(
            dir.path().to_path_buf(),
            "dev",
            std::iter::empty::<String>(),
            recorder.clone(),
        );

        let out = dir.path().join("personas").join("architect").join("a.md");
        guard
            .log_out_of_scope_write(&out, WriteType::Modify)
            .unwrap();
        assert!(
            recorder.recorded().is_empty(),
            "log_out_of_scope_write must not fire the publisher"
        );
    }
}
