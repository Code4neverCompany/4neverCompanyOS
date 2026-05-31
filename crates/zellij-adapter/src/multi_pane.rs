//! Multi-pane orchestration (M2 Story 2.4).
//!
//! Story 1.11 shipped the single-pane primitive (`spawn_pane`). This
//! module layers N-pane-per-session orchestration on top so that adding
//! more personas (M3 dynamic spawn, Story 3.3) is a bookkeeping change,
//! not a re-implementation.
//!
//! ## What this adds over `spawn_pane`
//!
//!   - **N panes per session** — [`MultiPaneSession`] tracks every pane it
//!     spawns into one Zellij session, enforcing a cap
//!     ([`MAX_PANES_PER_SESSION`], ≥ 10 per the Story 2.4 AC).
//!   - **Label-by-persona routing** — each pane is named with its persona
//!     ID (Zellij `--name`). The persona ID is the routing label callers
//!     use to find a pane and the key the persona-supervisor uses to
//!     direct that pane's stdin/stdout/stderr to
//!     `<vault>/personas/<persona_id>/log/...` (see `c4n-persona-supervisor`).
//!   - **Detach / reattach** — a Zellij session outlives the desktop app's
//!     process. [`MultiPaneSession::detach`] hands back a serializable
//!     [`SessionSnapshot`] the desktop persists; on next launch
//!     [`MultiPaneSession::reattach`] verifies the session's Zellij server
//!     is still alive and rebuilds the in-memory pane map.
//!
//! ## Why stdin/stdout/stderr is already per-pane
//!
//! Each Zellij pane is its own PTY. The OS gives every pane an independent
//! stdin/stdout/stderr by construction — there is no shared stream to
//! demultiplex. This module's job is therefore *labeling*: tying each PTY
//! to a stable persona ID so the supervisor and the desktop terminal view
//! know which stream belongs to which persona. The capture/forwarding of
//! those bytes lives in `c4n-persona-supervisor`, which is keyed by the
//! same persona ID.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

use crate::{
    list_sessions, session_name_matches, spawn_pane, PaneHandle, Result, SpawnPaneConfig,
    ZellijError,
};

/// Maximum panes a single [`MultiPaneSession`] will hold by default.
///
/// The Story 2.4 AC requires support for ≥ 10 panes per session. We cap at
/// 16 to bound terminal/PTY resource use while leaving comfortable headroom
/// over the planned persona roster (2 fixed + dynamic M3 agents). Callers
/// that need a different ceiling use [`MultiPaneSession::with_max_panes`].
pub const MAX_PANES_PER_SESSION: usize = 16;

/// One tracked pane within a session. Serializable so the desktop can
/// persist the full pane map across app restarts and feed it back to
/// [`MultiPaneSession::reattach`].
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Pane {
    /// Persona identity — the per-pane routing label. Unique within a
    /// session. Used as the Zellij pane `--name` and as the key the
    /// persona-supervisor uses to route this pane's streams.
    pub persona_id: String,
    /// Command running inside the pane (e.g. `"claude"`, `"hermes"`, or the
    /// persona-supervisor binary wrapping one of those).
    pub command: String,
    /// Args passed to `command`.
    pub args: Vec<String>,
}

impl Pane {
    /// The key callers route this pane's stdin/stdout/stderr by. Identical
    /// to `persona_id`; exposed as a method so the intent at call sites
    /// reads as routing rather than field access.
    pub fn io_routing_key(&self) -> &str {
        &self.persona_id
    }
}

/// Spec for spawning one persona's pane into a [`MultiPaneSession`]. A
/// trimmed [`SpawnPaneConfig`] without the `session_name`/`pane_name`
/// fields — the session owns the session name and derives the pane name
/// from `persona_id`.
#[derive(Debug, Clone)]
pub struct PersonaPaneSpec {
    /// Persona identity — becomes the pane label + routing key.
    pub persona_id: String,
    /// Command to run inside the pane.
    pub command: String,
    /// Args passed to the command.
    pub args: Vec<String>,
    /// Extra environment for the spawned process (layered over inherited env).
    pub env: HashMap<String, String>,
    /// Working directory the command runs in.
    pub cwd: Option<PathBuf>,
    /// If true, the pane closes when the command exits.
    pub close_on_exit: bool,
}

impl PersonaPaneSpec {
    /// New spec with empty env, no cwd, `close_on_exit = false` (panes stay
    /// open showing last output, matching the single-pane primitive default
    /// callers rely on for crash inspection).
    pub fn new(persona_id: impl Into<String>, command: impl Into<String>) -> Self {
        PersonaPaneSpec {
            persona_id: persona_id.into(),
            command: command.into(),
            args: Vec::new(),
            env: HashMap::new(),
            cwd: None,
            close_on_exit: false,
        }
    }

    /// Builder: set the full args vector.
    pub fn args<I, S>(mut self, args: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        self.args = args.into_iter().map(Into::into).collect();
        self
    }

    /// Builder: working directory.
    pub fn cwd(mut self, cwd: impl Into<PathBuf>) -> Self {
        self.cwd = Some(cwd.into());
        self
    }

    /// Builder: insert one env var.
    pub fn env(mut self, key: impl Into<String>, value: impl Into<String>) -> Self {
        self.env.insert(key.into(), value.into());
        self
    }

    /// Builder: set `close_on_exit`.
    pub fn close_on_exit(mut self, close: bool) -> Self {
        self.close_on_exit = close;
        self
    }
}

/// Serializable snapshot of a session's pane layout. The desktop persists
/// this (e.g. in its project state) so that after an app restart it can
/// [`MultiPaneSession::reattach`] to the still-running Zellij session and
/// recover which persona owns which pane.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SessionSnapshot {
    pub session_name: String,
    pub panes: Vec<Pane>,
    pub max_panes: usize,
}

/// Tracks N panes within a single Zellij session, keyed by persona ID.
///
/// In-memory bookkeeping over the [`spawn_pane`] primitive; the Zellij
/// server is the source of truth for liveness ([`session_exists`]).
///
/// [`session_exists`]: MultiPaneSession::session_exists
#[derive(Debug, Clone)]
pub struct MultiPaneSession {
    session_name: String,
    panes: Vec<Pane>,
    max_panes: usize,
}

impl MultiPaneSession {
    /// New empty session map with the default pane cap
    /// ([`MAX_PANES_PER_SESSION`]). Does not touch Zellij — panes appear in
    /// the real session only once [`spawn_persona_pane`] is called.
    ///
    /// [`spawn_persona_pane`]: MultiPaneSession::spawn_persona_pane
    pub fn new(session_name: impl Into<String>) -> Self {
        MultiPaneSession {
            session_name: session_name.into(),
            panes: Vec::new(),
            max_panes: MAX_PANES_PER_SESSION,
        }
    }

    /// New empty session map with a custom pane cap. `max_panes` is clamped
    /// to at least 1 (a session with a zero cap can't hold any pane and is
    /// almost certainly a caller bug).
    pub fn with_max_panes(session_name: impl Into<String>, max_panes: usize) -> Self {
        MultiPaneSession {
            session_name: session_name.into(),
            panes: Vec::new(),
            max_panes: max_panes.max(1),
        }
    }

    pub fn session_name(&self) -> &str {
        &self.session_name
    }

    pub fn max_panes(&self) -> usize {
        self.max_panes
    }

    pub fn pane_count(&self) -> usize {
        self.panes.len()
    }

    pub fn is_empty(&self) -> bool {
        self.panes.is_empty()
    }

    /// All tracked panes, in spawn order.
    pub fn panes(&self) -> &[Pane] {
        &self.panes
    }

    /// Persona IDs of all tracked panes, in spawn order.
    pub fn personas(&self) -> Vec<&str> {
        self.panes.iter().map(|p| p.persona_id.as_str()).collect()
    }

    /// True if a pane for `persona_id` is tracked.
    pub fn contains(&self, persona_id: &str) -> bool {
        self.panes.iter().any(|p| p.persona_id == persona_id)
    }

    /// The tracked pane for `persona_id`, if any.
    pub fn pane_for(&self, persona_id: &str) -> Option<&Pane> {
        self.panes.iter().find(|p| p.persona_id == persona_id)
    }

    /// Spawn one persona's pane into this session and record it.
    ///
    /// The pane is created in the Zellij session named by this struct
    /// (created on-demand if it's the first pane), labeled with the persona
    /// ID. Returns the [`PaneHandle`] from the underlying primitive.
    ///
    /// Errors:
    ///   - [`ZellijError::DuplicatePersona`] if a pane for this persona is
    ///     already tracked (persona IDs are the unique routing label).
    ///   - [`ZellijError::TooManyPanes`] if the session is at its cap.
    ///   - Any error `spawn_pane` surfaces (Zellij not installed, command
    ///     failed, I/O). On a spawn failure the pane is *not* recorded, so
    ///     the in-memory map stays consistent with what Zellij actually has.
    pub fn spawn_persona_pane(&mut self, spec: PersonaPaneSpec) -> Result<PaneHandle> {
        if self.contains(&spec.persona_id) {
            return Err(ZellijError::DuplicatePersona {
                session: self.session_name.clone(),
                persona_id: spec.persona_id.clone(),
            });
        }
        if self.panes.len() >= self.max_panes {
            return Err(ZellijError::TooManyPanes {
                session: self.session_name.clone(),
                max: self.max_panes,
            });
        }

        let config = SpawnPaneConfig {
            session_name: self.session_name.clone(),
            command: spec.command.clone(),
            args: spec.args.clone(),
            env: spec.env,
            cwd: spec.cwd,
            pane_name: Some(spec.persona_id.clone()),
            close_on_exit: spec.close_on_exit,
        };

        let handle = spawn_pane(config)?;

        self.panes.push(Pane {
            persona_id: spec.persona_id,
            command: spec.command,
            args: spec.args,
        });

        Ok(handle)
    }

    /// True if this session's Zellij server is still alive.
    pub fn session_exists(&self) -> Result<bool> {
        Ok(list_sessions()?
            .iter()
            .any(|s| session_name_matches(s, &self.session_name)))
    }

    /// Kill the whole session — every pane and the Zellij server for it.
    /// After this the in-memory map is stale; drop the struct.
    pub fn kill(&self) -> Result<()> {
        PaneHandle {
            session_name: self.session_name.clone(),
            pane_name: None,
        }
        .kill()
    }

    /// Serializable snapshot of the current pane layout.
    pub fn snapshot(&self) -> SessionSnapshot {
        SessionSnapshot {
            session_name: self.session_name.clone(),
            panes: self.panes.clone(),
            max_panes: self.max_panes,
        }
    }

    /// Detach: return the snapshot for the caller to persist, consuming the
    /// in-memory handle.
    ///
    /// A Zellij session keeps running with no client attached — detaching is
    /// purely about *this process* letting go of its in-memory view. The
    /// real session is recovered later via [`reattach`].
    ///
    /// [`reattach`]: MultiPaneSession::reattach
    pub fn detach(self) -> SessionSnapshot {
        self.snapshot()
    }

    /// Rebuild a session map from a snapshot without checking liveness.
    /// Use [`reattach`] when you need the "is the Zellij server still
    /// there?" guarantee.
    ///
    /// [`reattach`]: MultiPaneSession::reattach
    pub fn from_snapshot(snapshot: SessionSnapshot) -> Self {
        MultiPaneSession {
            session_name: snapshot.session_name,
            panes: snapshot.panes,
            max_panes: snapshot.max_panes.max(1),
        }
    }

    /// Reattach to a previously-detached session: verify its Zellij server
    /// is still alive, then rebuild the in-memory map from the snapshot.
    ///
    /// Errors with [`ZellijError::SessionNotFound`] if the session named by
    /// the snapshot no longer exists (e.g. the machine rebooted and the
    /// Zellij server didn't come back).
    pub fn reattach(snapshot: SessionSnapshot) -> Result<Self> {
        let alive = list_sessions()?
            .iter()
            .any(|s| session_name_matches(s, &snapshot.session_name));
        if !alive {
            return Err(ZellijError::SessionNotFound {
                session: snapshot.session_name,
            });
        }
        Ok(Self::from_snapshot(snapshot))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn spec(id: &str) -> PersonaPaneSpec {
        PersonaPaneSpec::new(id, if cfg!(windows) { "cmd" } else { "true" })
    }

    #[test]
    fn new_session_is_empty_with_default_cap() {
        let s = MultiPaneSession::new("dev-c4n");
        assert_eq!(s.session_name(), "dev-c4n");
        assert_eq!(s.pane_count(), 0);
        assert!(s.is_empty());
        assert_eq!(s.max_panes(), MAX_PANES_PER_SESSION);
        assert!(s.max_panes() >= 10, "AC requires >= 10 panes per session");
    }

    #[test]
    fn with_max_panes_clamps_to_at_least_one() {
        assert_eq!(MultiPaneSession::with_max_panes("s", 0).max_panes(), 1);
        assert_eq!(MultiPaneSession::with_max_panes("s", 12).max_panes(), 12);
    }

    #[test]
    fn persona_pane_spec_builders() {
        let s = PersonaPaneSpec::new("frontend", "claude")
            .args(["--flag", "value"])
            .env("KEY", "val")
            .cwd("/work")
            .close_on_exit(true);
        assert_eq!(s.persona_id, "frontend");
        assert_eq!(s.command, "claude");
        assert_eq!(s.args, vec!["--flag", "value"]);
        assert_eq!(s.env.get("KEY").map(String::as_str), Some("val"));
        assert_eq!(s.cwd, Some(PathBuf::from("/work")));
        assert!(s.close_on_exit);
    }

    #[test]
    fn pane_io_routing_key_is_persona_id() {
        let p = Pane {
            persona_id: "hermes".into(),
            command: "hermes".into(),
            args: vec![],
        };
        assert_eq!(p.io_routing_key(), "hermes");
    }

    /// Capacity + duplicate checks must fire *before* touching Zellij, so
    /// these run without a real install. We exercise them by pre-seeding the
    /// pane map through a snapshot, then asserting the guards.
    #[test]
    fn capacity_guard_rejects_overflow() {
        let panes: Vec<Pane> = (0..2)
            .map(|i| Pane {
                persona_id: format!("p{i}"),
                command: "x".into(),
                args: vec![],
            })
            .collect();
        let mut s = MultiPaneSession::from_snapshot(SessionSnapshot {
            session_name: "full".into(),
            panes,
            max_panes: 2,
        });
        let err = s.spawn_persona_pane(spec("p2")).unwrap_err();
        assert!(
            matches!(err, ZellijError::TooManyPanes { max: 2, .. }),
            "expected TooManyPanes, got {err:?}"
        );
        assert_eq!(s.pane_count(), 2, "rejected pane must not be recorded");
    }

    #[test]
    fn duplicate_persona_guard() {
        let mut s = MultiPaneSession::from_snapshot(SessionSnapshot {
            session_name: "dup".into(),
            panes: vec![Pane {
                persona_id: "dev".into(),
                command: "x".into(),
                args: vec![],
            }],
            max_panes: 10,
        });
        let err = s.spawn_persona_pane(spec("dev")).unwrap_err();
        assert!(
            matches!(&err, ZellijError::DuplicatePersona { persona_id, .. } if persona_id == "dev"),
            "expected DuplicatePersona, got {err:?}"
        );
    }

    #[test]
    fn lookup_helpers() {
        let s = MultiPaneSession::from_snapshot(SessionSnapshot {
            session_name: "look".into(),
            panes: vec![
                Pane {
                    persona_id: "dev".into(),
                    command: "claude".into(),
                    args: vec![],
                },
                Pane {
                    persona_id: "hermes".into(),
                    command: "hermes".into(),
                    args: vec![],
                },
            ],
            max_panes: 10,
        });
        assert!(s.contains("dev"));
        assert!(!s.contains("nope"));
        assert_eq!(s.personas(), vec!["dev", "hermes"]);
        assert_eq!(
            s.pane_for("hermes").map(|p| p.command.as_str()),
            Some("hermes")
        );
        assert!(s.pane_for("nope").is_none());
    }

    #[test]
    fn snapshot_roundtrips_through_serde() {
        let original = MultiPaneSession::from_snapshot(SessionSnapshot {
            session_name: "rt".into(),
            panes: (0..5)
                .map(|i| Pane {
                    persona_id: format!("persona-{i}"),
                    command: "claude".into(),
                    args: vec![format!("--id={i}")],
                })
                .collect(),
            max_panes: 12,
        });
        let snap = original.snapshot();
        let json = serde_json::to_string(&snap).unwrap();
        let back: SessionSnapshot = serde_json::from_str(&json).unwrap();
        assert_eq!(snap, back);

        let rebuilt = MultiPaneSession::from_snapshot(back);
        assert_eq!(rebuilt.session_name(), "rt");
        assert_eq!(rebuilt.pane_count(), 5);
        assert_eq!(rebuilt.max_panes(), 12);
        assert_eq!(rebuilt.personas()[2], "persona-2");
    }

    #[test]
    fn detach_returns_snapshot_matching_state() {
        let s = MultiPaneSession::from_snapshot(SessionSnapshot {
            session_name: "d".into(),
            panes: vec![Pane {
                persona_id: "dev".into(),
                command: "claude".into(),
                args: vec![],
            }],
            max_panes: 8,
        });
        let snap = s.detach();
        assert_eq!(snap.session_name, "d");
        assert_eq!(snap.panes.len(), 1);
        assert_eq!(snap.max_panes, 8);
    }

    /// Integration test — 5+ panes spawned simultaneously into one session,
    /// then detach + reattach. Verifies the Story 2.4 AC against a real
    /// Zellij install. Skips cleanly when Zellij isn't available (CI runners
    /// don't have it).
    ///
    /// Run explicitly with:
    ///   `cargo test -p c4n-zellij-adapter -- --ignored multi_pane`
    #[test]
    #[ignore = "needs zellij >= 0.44 installed; CI runners don't have it"]
    fn five_panes_spawn_detach_reattach_roundtrip() {
        if !crate::is_available() {
            eprintln!("zellij not installed — skipping multi-pane integration test");
            return;
        }

        let session_name = format!("c4n-multipane-test-{}", std::process::id());
        let mut session = MultiPaneSession::new(&session_name);

        // Spawn 5 labeled panes simultaneously into the one session. Use a
        // cheap shell so the panes are inexpensive; close_on_exit(false)
        // keeps them present for the duration of the test.
        const N: usize = 5;
        for i in 0..N {
            let s = PersonaPaneSpec::new(
                format!("persona-{i}"),
                if cfg!(windows) { "cmd" } else { "sh" },
            )
            .args(if cfg!(windows) {
                vec!["/C".to_string(), "echo pane && pause".to_string()]
            } else {
                vec!["-c".to_string(), "echo pane; sleep 30".to_string()]
            })
            .close_on_exit(false);
            session
                .spawn_persona_pane(s)
                .unwrap_or_else(|e| panic!("spawn pane {i} should succeed: {e}"));
        }

        assert_eq!(session.pane_count(), N, "all {N} panes tracked");
        assert!(
            session.session_exists().expect("liveness query"),
            "session must be alive after spawning {N} panes"
        );
        for i in 0..N {
            assert!(session.contains(&format!("persona-{i}")));
        }

        // Detach: hand back the snapshot, drop the in-memory handle. The
        // Zellij session keeps running with no client attached.
        let snapshot = session.detach();
        assert_eq!(snapshot.panes.len(), N);

        // Reattach: verify the still-running server and rebuild the map.
        let reattached =
            MultiPaneSession::reattach(snapshot).expect("reattach to live session should succeed");
        assert_eq!(reattached.pane_count(), N, "pane map survives reattach");
        assert!(reattached
            .session_exists()
            .expect("liveness query after reattach"));

        // Cleanup — kill the whole session.
        reattached.kill().expect("kill should succeed");

        // After kill, reattach to the same (now-dead) snapshot must fail.
        let dead = SessionSnapshot {
            session_name: session_name.clone(),
            panes: vec![],
            max_panes: MAX_PANES_PER_SESSION,
        };
        // Give Zellij a moment to tear the session down before asserting.
        std::thread::sleep(std::time::Duration::from_millis(500));
        let err = MultiPaneSession::reattach(dead).unwrap_err();
        assert!(
            matches!(err, ZellijError::SessionNotFound { .. }),
            "reattach to killed session should report SessionNotFound, got {err:?}"
        );
    }
}
