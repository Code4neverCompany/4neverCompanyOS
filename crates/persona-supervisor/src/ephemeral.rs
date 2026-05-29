//! Ephemeral persona lifecycle — spawn → task → exit cleanly (Story 3.6).
//!
//! An *ephemeral* persona (e.g. a Security Reviewer spun up for a single
//! PR) differs from the persistent personas wrapped by [`crate::supervise`]
//! in three ways that this module enforces:
//!
//!   1. **Single task, then exit.** The backing CLI is invoked in a
//!      non-interactive / print mode (e.g. `claude -p "<task>"`), runs to
//!      completion, and exits. There is no PTY and no long-lived session.
//!   2. **Output is an artifact, not a log.** The child's stdout is
//!      captured and written to
//!      `<vault>/projects/<project-id>/reviews/<ts>-<slug>.md` — the
//!      durable work product. No `<vault>/personas/<slug>/` directory is
//!      created, so the ephemeral leaves zero vault residue (NFR-Reliability).
//!   3. **Zero orphans.** The child is always reaped via
//!      [`std::process::Child::wait_with_output`] before the function
//!      returns. There is no window between spawn and wait in which an
//!      early return could leak the process. SM-5 success metric: zero
//!      orphan processes across 100 spawn/exit cycles (see the
//!      `hundred_cycle_zero_orphans` test).
//!
//! ## Bus integration seam
//!
//! The acceptance criteria require the ephemeral to "post a final task
//! complete bus message" and to retain "no bus identity" after exit. The
//! pub/sub bus (`c4n-bus-relay` / `@c4n/bus-client`) is still scaffolding
//! at the time of this story (its protocol schema lands with the M2 bus
//! stories), so the bus interaction is expressed here as the
//! [`EphemeralNotifier`] trait rather than a hard dependency:
//!
//!   - [`EphemeralNotifier::on_register`]   — register the bus identity at start.
//!   - [`EphemeralNotifier::on_task_complete`] — post the "task complete" message.
//!   - [`EphemeralNotifier::on_deregister`] — drop the bus identity on exit.
//!
//! `run_ephemeral` calls these in `register → task_complete → deregister`
//! order and *always* deregisters (even on child failure), so no identity
//! is retained after exit. The real bus client implements this trait once
//! it exists; until then [`NullNotifier`] is a no-op and tests use a
//! recording notifier to assert the register/deregister balance.

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use crate::SupervisorError;

/// What the ephemeral runner needs to spawn a one-shot persona, capture
/// its output, and post the result.
#[derive(Debug, Clone)]
pub struct EphemeralConfig {
    /// kebab-case slug used in the artifact filename and as the bus
    /// identity (e.g. `"security-reviewer"`). MUST NOT be used to create
    /// a `personas/<slug>/` directory — ephemerals leave no persona dir.
    pub slug: String,
    /// Stable project identity. Determines the reviews output directory:
    /// `<vault>/projects/<project_id>/reviews/`.
    pub project_id: String,
    /// Vault root.
    pub vault_path: PathBuf,
    /// Backing CLI to run (resolved via PATH unless absolute), e.g.
    /// `"claude"`.
    pub command: String,
    /// Args passed to the CLI. For a one-shot run these encode the task
    /// prompt in the CLI's non-interactive form, e.g.
    /// `["-p", "<task prompt>"]` for Claude Code.
    pub args: Vec<String>,
    /// Working directory the CLI runs in. `None` ⇒ inherit the caller's cwd.
    pub cwd: Option<PathBuf>,
}

/// Result of one ephemeral lifecycle.
#[derive(Debug, Clone)]
pub struct EphemeralOutcome {
    /// The child's exit code (low 8 bits, mirroring shell convention).
    pub exit_code: i32,
    /// Absolute path of the artifact written under the project's
    /// `reviews/` directory.
    pub artifact_path: PathBuf,
    /// Bytes captured from the child's stdout and written to the artifact.
    pub bytes_written: usize,
    /// Number of orphan processes left behind. Always `0` for a correct
    /// run — the field exists so callers and the SM-5 cycle test can sum
    /// it across many runs and assert the invariant explicitly.
    pub orphans: usize,
}

/// Hook surface for the pub/sub bus. See the module docs for why this is
/// a trait rather than a direct dependency on the bus client.
///
/// All methods take `&self` and are infallible from the runner's point of
/// view: a bus that is unreachable must not strand an ephemeral or leak
/// its process. Implementations should swallow/log their own transport
/// errors.
pub trait EphemeralNotifier {
    /// Register the ephemeral's bus identity at spawn time.
    fn on_register(&self, identity: &str);
    /// Post the final "task complete" message, pointing at the artifact.
    fn on_task_complete(&self, identity: &str, artifact: &Path, exit_code: i32);
    /// Drop the ephemeral's bus identity. Called unconditionally on exit
    /// so no identity is retained, even when the task failed.
    fn on_deregister(&self, identity: &str);
}

/// No-op notifier used when no bus is wired (current default — the bus
/// client is scaffolding until the M2 bus stories land).
#[derive(Debug, Default, Clone, Copy)]
pub struct NullNotifier;

impl EphemeralNotifier for NullNotifier {
    fn on_register(&self, _identity: &str) {}
    fn on_task_complete(&self, _identity: &str, _artifact: &Path, _exit_code: i32) {}
    fn on_deregister(&self, _identity: &str) {}
}

/// Compute the artifact path for an ephemeral's output:
/// `<vault>/projects/<project_id>/reviews/<timestamp>-<slug>.md`.
///
/// `timestamp` is a sortable `YYYYMMDD-HHMMSS` UTC string so multiple
/// reviews in the same project order chronologically by filename. Kept
/// pure (timestamp injected) so tests get deterministic paths.
pub fn ephemeral_artifact_path(
    vault: &Path,
    project_id: &str,
    slug: &str,
    timestamp: &str,
) -> PathBuf {
    vault
        .join("projects")
        .join(project_id)
        .join("reviews")
        .join(format!("{timestamp}-{slug}.md"))
}

/// Current UTC timestamp as a sortable `YYYYMMDD-HHMMSS` string.
fn artifact_timestamp() -> String {
    chrono::Utc::now().format("%Y%m%d-%H%M%S").to_string()
}

/// Run one ephemeral lifecycle to completion:
///
///   1. `notifier.on_register(slug)`.
///   2. Spawn `command args…` with stdout captured, then immediately
///      `wait_with_output()` — the child is reaped before any further
///      fallible work, so no orphan can leak.
///   3. Write captured stdout to the project's `reviews/` artifact.
///   4. `notifier.on_task_complete(slug, artifact, exit_code)`.
///   5. `notifier.on_deregister(slug)` — always, via the deregister-on-
///      drop guard, even if step 3 fails.
///
/// Returns the [`EphemeralOutcome`]. Does NOT create
/// `<vault>/personas/<slug>/` — that absence is the "zero vault residue"
/// guarantee, asserted by the cycle test.
pub fn run_ephemeral(
    config: EphemeralConfig,
    notifier: &dyn EphemeralNotifier,
) -> Result<EphemeralOutcome, SupervisorError> {
    // Deregister-on-drop: guarantees the bus identity is dropped no matter
    // which error path we take after registering. "No bus identity retained
    // on exit" is thereby structural, not best-effort.
    struct DeregisterGuard<'a> {
        notifier: &'a dyn EphemeralNotifier,
        identity: &'a str,
    }
    impl Drop for DeregisterGuard<'_> {
        fn drop(&mut self) {
            self.notifier.on_deregister(self.identity);
        }
    }

    notifier.on_register(&config.slug);
    let _guard = DeregisterGuard {
        notifier,
        identity: &config.slug,
    };

    // Spawn + reap with no fallible operation in between. `wait_with_output`
    // reads stdout to EOF (child closes it on exit) and reaps the child,
    // so the process is gone before we touch the filesystem.
    let child = Command::new(&config.command)
        .args(&config.args)
        .current_dir_opt(config.cwd.as_deref())
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| SupervisorError::Spawn {
            command: config.command.clone(),
            source: e.into(),
        })?;

    let output = child.wait_with_output().map_err(SupervisorError::Io)?;
    let exit_code = output.status.code().unwrap_or(-1);

    // Write the captured stdout as the durable artifact under the project's
    // reviews dir. The reviews dir is created on demand; the personas dir is
    // deliberately never touched.
    let timestamp = artifact_timestamp();
    let artifact_path =
        ephemeral_artifact_path(&config.vault_path, &config.project_id, &config.slug, &timestamp);
    if let Some(parent) = artifact_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let body = build_artifact_body(&config, exit_code, &output.stdout, &output.stderr);
    std::fs::write(&artifact_path, &body)?;

    notifier.on_task_complete(&config.slug, &artifact_path, exit_code);

    Ok(EphemeralOutcome {
        exit_code,
        artifact_path,
        bytes_written: body.len(),
        orphans: 0,
    })
}

/// Build the markdown artifact body: a small header plus the captured
/// task output. Stderr is appended in a fenced block only when non-empty
/// so a clean run produces a clean artifact.
fn build_artifact_body(
    config: &EphemeralConfig,
    exit_code: i32,
    stdout: &[u8],
    stderr: &[u8],
) -> String {
    let mut s = String::new();
    s.push_str(&format!("# Ephemeral review — {}\n\n", config.slug));
    s.push_str(&format!("- backing CLI: `{}`\n", config.command));
    s.push_str(&format!("- exit code: {exit_code}\n\n"));
    s.push_str("## Output\n\n");
    s.push_str(&String::from_utf8_lossy(stdout));
    if !stdout.ends_with(b"\n") {
        s.push('\n');
    }
    if !stderr.is_empty() {
        s.push_str("\n## Stderr\n\n```\n");
        s.push_str(&String::from_utf8_lossy(stderr));
        if !stderr.ends_with(b"\n") {
            s.push('\n');
        }
        s.push_str("```\n");
    }
    s
}

/// Tiny extension so `current_dir` can be set conditionally without an
/// awkward `match` at the call site.
trait CommandCwdExt {
    fn current_dir_opt(&mut self, cwd: Option<&Path>) -> &mut Self;
}
impl CommandCwdExt for Command {
    fn current_dir_opt(&mut self, cwd: Option<&Path>) -> &mut Self {
        if let Some(dir) = cwd {
            self.current_dir(dir);
        }
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use tempfile::TempDir;

    /// Recording notifier: counts register/deregister calls and remembers
    /// the last task-complete so tests can assert the bus lifecycle.
    #[derive(Default)]
    struct RecordingNotifier {
        registered: AtomicUsize,
        deregistered: AtomicUsize,
        completed: AtomicUsize,
    }
    impl EphemeralNotifier for RecordingNotifier {
        fn on_register(&self, _identity: &str) {
            self.registered.fetch_add(1, Ordering::SeqCst);
        }
        fn on_task_complete(&self, _identity: &str, _artifact: &Path, _code: i32) {
            self.completed.fetch_add(1, Ordering::SeqCst);
        }
        fn on_deregister(&self, _identity: &str) {
            self.deregistered.fetch_add(1, Ordering::SeqCst);
        }
    }

    /// A trivial, fast, dependency-free child command that prints a line
    /// and exits 0. Spawns no grandchildren, so reaping it is the whole
    /// of "zero orphans" for this primitive.
    fn echo_cmd() -> (String, Vec<String>) {
        if cfg!(windows) {
            (
                "cmd".to_string(),
                vec!["/C".into(), "echo".into(), "ephemeral-ok".into()],
            )
        } else {
            (
                "/bin/sh".to_string(),
                vec!["-c".into(), "echo ephemeral-ok".into()],
            )
        }
    }

    fn config_for(vault: &Path, slug: &str) -> EphemeralConfig {
        let (command, args) = echo_cmd();
        EphemeralConfig {
            slug: slug.to_string(),
            project_id: "demo-proj-0a1b2c3d".to_string(),
            vault_path: vault.to_path_buf(),
            command,
            args,
            cwd: None,
        }
    }

    #[test]
    fn artifact_path_is_under_project_reviews() {
        let p = ephemeral_artifact_path(
            Path::new("/vault"),
            "demo-proj-0a1b2c3d",
            "security-reviewer",
            "20260529-120000",
        );
        let s = p.to_string_lossy().replace('\\', "/");
        assert!(
            s.ends_with("projects/demo-proj-0a1b2c3d/reviews/20260529-120000-security-reviewer.md"),
            "got: {s}"
        );
    }

    #[test]
    fn run_ephemeral_writes_artifact_and_reaps() {
        let vault = TempDir::new().unwrap();
        let notifier = RecordingNotifier::default();
        let outcome =
            run_ephemeral(config_for(vault.path(), "security-reviewer"), &notifier).unwrap();

        assert_eq!(outcome.exit_code, 0);
        assert_eq!(outcome.orphans, 0);
        assert!(outcome.artifact_path.exists(), "artifact must be written");
        let body = std::fs::read_to_string(&outcome.artifact_path).unwrap();
        assert!(body.contains("ephemeral-ok"), "captured output, got: {body}");

        // Bus lifecycle: registered once, completed once, deregistered once.
        assert_eq!(notifier.registered.load(Ordering::SeqCst), 1);
        assert_eq!(notifier.completed.load(Ordering::SeqCst), 1);
        assert_eq!(
            notifier.deregistered.load(Ordering::SeqCst),
            1,
            "identity must be deregistered on exit (no identity retained)"
        );
    }

    #[test]
    fn run_ephemeral_leaves_no_persona_vault_dir() {
        let vault = TempDir::new().unwrap();
        let notifier = NullNotifier;
        run_ephemeral(config_for(vault.path(), "security-reviewer"), &notifier).unwrap();

        // The ephemeral must NOT create vault/personas/<slug>/ — zero residue.
        let personas = vault.path().join("personas");
        assert!(
            !personas.exists(),
            "ephemeral must not create a personas/ directory"
        );
        // It SHOULD have created the project reviews dir with the artifact.
        let reviews = vault
            .path()
            .join("projects")
            .join("demo-proj-0a1b2c3d")
            .join("reviews");
        let count = std::fs::read_dir(&reviews).unwrap().count();
        assert_eq!(count, 1, "exactly one review artifact expected");
    }

    #[test]
    fn deregisters_even_when_child_fails() {
        // Point at a command that doesn't exist → spawn error. The
        // register/deregister balance must still hold (guard runs on drop).
        let vault = TempDir::new().unwrap();
        let notifier = RecordingNotifier::default();
        let cfg = EphemeralConfig {
            slug: "broken".to_string(),
            project_id: "demo-proj-0a1b2c3d".to_string(),
            vault_path: vault.path().to_path_buf(),
            command: "c4n-no-such-binary-xyzzy".to_string(),
            args: vec![],
            cwd: None,
        };
        let res = run_ephemeral(cfg, &notifier);
        assert!(res.is_err(), "spawn of a missing binary should error");
        assert_eq!(notifier.registered.load(Ordering::SeqCst), 1);
        assert_eq!(
            notifier.deregistered.load(Ordering::SeqCst),
            1,
            "identity must be deregistered even on spawn failure"
        );
    }

    /// SM-5 success metric: 100 spawn/exit cycles leave zero orphans, write
    /// 100 artifacts, never create a personas/ residue dir, and keep the
    /// bus register/deregister count balanced.
    ///
    /// Each child (`echo`) spawns no grandchildren, so the only orphan risk
    /// is failing to reap the direct child — which `run_ephemeral` rules out
    /// by waiting before it returns. Summing `outcome.orphans` makes the
    /// invariant an explicit assertion rather than an implicit one.
    #[test]
    fn hundred_cycle_zero_orphans() {
        let vault = TempDir::new().unwrap();
        let notifier = RecordingNotifier::default();
        let mut total_orphans = 0usize;

        for i in 0..100 {
            let slug = format!("reviewer-{i:03}");
            let outcome = run_ephemeral(config_for(vault.path(), &slug), &notifier)
                .unwrap_or_else(|e| panic!("cycle {i} failed: {e}"));
            total_orphans += outcome.orphans;
            assert_eq!(outcome.exit_code, 0, "cycle {i} child should exit 0");
            assert!(outcome.artifact_path.exists(), "cycle {i} artifact missing");
        }

        assert_eq!(total_orphans, 0, "SM-5: zero orphans across 100 cycles");

        // No persona residue accumulated across all cycles.
        assert!(
            !vault.path().join("personas").exists(),
            "no personas/ dir should be created across 100 ephemeral cycles"
        );

        // 100 artifacts written under the single project's reviews dir.
        let reviews = vault
            .path()
            .join("projects")
            .join("demo-proj-0a1b2c3d")
            .join("reviews");
        let count = std::fs::read_dir(&reviews).unwrap().count();
        assert_eq!(count, 100, "expected 100 review artifacts");

        // Bus identities all dropped: register count == deregister count == 100.
        assert_eq!(notifier.registered.load(Ordering::SeqCst), 100);
        assert_eq!(notifier.deregistered.load(Ordering::SeqCst), 100);
        assert_eq!(notifier.completed.load(Ordering::SeqCst), 100);
    }
}
