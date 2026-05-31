//! Pause / redirect / resume control surface for personas (Story 3.11).
//!
//! Provides a first-class control surface for any active persona — persistent
//! (running pane supervised by [`crate::supervise`]) or ephemeral (in-flight
//! task from [`crate::run_ephemeral`]).
//!
//! ## Design
//!
//! Control signals travel over a bounded [`tokio::sync::mpsc`] channel:
//!
//! - The UI / Tauri command layer holds a [`PersonaControlHandle`] (the sender).
//! - The supervisor's input-watcher task holds the receiver and acts on signals.
//!
//! Backpressure is intentional: if the supervisor is overwhelmed the sender
//! blocks briefly rather than buffering unbounded signals.
//!
//! ## Bus events
//!
//! State transitions are reported through [`ControlNotifier`]. The real bus
//! client implements this trait and emits [`BusEnvelope`]s per the NEVAAA-28
//! schema; until then [`NullControlNotifier`] is the default, keeping the
//! supervisor compile-independent of the bus crate.
//!
//! Event type strings (dot-namespaced, per architecture.md §5):
//!   - `persona.paused`
//!   - `persona.resumed`
//!   - `persona.redirected`
//!
//! [`BusEnvelope`]: <../../c4n-bus-relay/index.html>

use tokio::sync::mpsc;

/// Bounded control-channel capacity.
/// Sixteen slots handles rapid burst sequences while providing backpressure.
pub const CONTROL_CHANNEL_CAPACITY: usize = 16;

/// Bus event type emitted when a persona is paused.
pub const EVENT_PAUSED: &str = "persona.paused";
/// Bus event type emitted when a persona resumes.
pub const EVENT_RESUMED: &str = "persona.resumed";
/// Bus event type emitted when a redirect is delivered to a persona.
pub const EVENT_REDIRECTED: &str = "persona.redirected";

/// Command sent to a running persona to control its task pickup.
#[derive(Debug, Clone)]
pub enum ControlSignal {
    /// Halt new task pickup. Input forwarding from `current.pty.in` is
    /// suspended; the PTY is left alive so the current output remains visible.
    Pause,
    /// Resume normal task processing after a pause.
    Resume,
    /// Interrupt: write `task` directly to the persona's PTY stdin, bypassing
    /// the `current.pty.in` queue. Valid from any state (Running or Paused).
    Redirect {
        /// Task text delivered directly to the persona's PTY.
        task: String,
    },
}

/// Visible state of a persona's task-pickup.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PersonaState {
    /// Normal operation — input forwarded, tasks picked up.
    Running,
    /// Paused — input forwarding from `current.pty.in` is suspended.
    Paused,
}

/// Bus-event hook for persona state transitions.
///
/// Production: implement with the real bus client once it exists.
/// Default: [`NullControlNotifier`] — compile-independent of the bus crate.
///
/// All methods are infallible from the supervisor's perspective: a bus that
/// is unreachable must not strand or halt the supervised persona.
pub trait ControlNotifier: Send + Sync {
    /// The persona transitioned to [`PersonaState::Paused`].
    fn on_paused(&self, persona_id: &str);
    /// The persona transitioned back to [`PersonaState::Running`].
    fn on_resumed(&self, persona_id: &str);
    /// A redirect task was delivered directly to the persona's PTY.
    fn on_redirected(&self, persona_id: &str, task: &str);
}

/// No-op notifier. Default until the real bus client is wired.
#[derive(Debug, Default, Clone, Copy)]
pub struct NullControlNotifier;

impl ControlNotifier for NullControlNotifier {
    fn on_paused(&self, _persona_id: &str) {}
    fn on_resumed(&self, _persona_id: &str) {}
    fn on_redirected(&self, _persona_id: &str, _task: &str) {}
}

/// Returned when a control operation targets a persona that has already exited.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PersonaGone;

impl std::fmt::Display for PersonaGone {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "persona has exited (control channel closed)")
    }
}

impl std::error::Error for PersonaGone {}

/// Sender half given to the UI / Tauri command layer to drive a running persona.
///
/// Obtained from [`crate::supervise_controlled`] via the paired constructor
/// [`PersonaControlHandle::pair`]. Cheap to clone — backed by
/// `tokio::sync::mpsc::Sender` which is `Arc`-backed.
///
/// ## Usage sketch (Tauri command)
/// ```ignore
/// let (handle, rx) = PersonaControlHandle::pair("dev");
/// let notifier = Arc::new(MyBusNotifier::new());
/// tokio::spawn(async move {
///     supervise_controlled(config, Some(rx), notifier).await
/// });
/// // hand `handle` to the persona card in the UI
/// handle.pause().await?;
/// ```
#[derive(Clone, Debug)]
pub struct PersonaControlHandle {
    tx: mpsc::Sender<ControlSignal>,
    /// Persona identity string; mirrors `SupervisorConfig::persona_id`.
    pub persona_id: String,
}

impl PersonaControlHandle {
    /// Create a paired `(handle, receiver)`. Pass the receiver to
    /// [`crate::supervise_controlled`]; retain the handle in the UI layer.
    pub fn pair(persona_id: impl Into<String>) -> (Self, mpsc::Receiver<ControlSignal>) {
        let (tx, rx) = mpsc::channel(CONTROL_CHANNEL_CAPACITY);
        (
            PersonaControlHandle {
                tx,
                persona_id: persona_id.into(),
            },
            rx,
        )
    }

    /// Pause the persona. Returns `Err(PersonaGone)` if the persona has exited.
    pub async fn pause(&self) -> Result<(), PersonaGone> {
        self.tx
            .send(ControlSignal::Pause)
            .await
            .map_err(|_| PersonaGone)
    }

    /// Resume a paused persona.
    pub async fn resume(&self) -> Result<(), PersonaGone> {
        self.tx
            .send(ControlSignal::Resume)
            .await
            .map_err(|_| PersonaGone)
    }

    /// Interrupt the persona with a new task/instruction delivered directly
    /// to the PTY stdin. Valid from any state (Running or Paused).
    pub async fn redirect(&self, task: impl Into<String>) -> Result<(), PersonaGone> {
        self.tx
            .send(ControlSignal::Redirect { task: task.into() })
            .await
            .map_err(|_| PersonaGone)
    }

    /// `true` while the supervisor is alive and the channel is open.
    pub fn is_alive(&self) -> bool {
        !self.tx.is_closed()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    /// Recording notifier that tallies state-transition calls for assertions.
    #[derive(Default)]
    struct RecordingControlNotifier {
        paused: AtomicUsize,
        resumed: AtomicUsize,
        redirected: AtomicUsize,
    }

    impl ControlNotifier for RecordingControlNotifier {
        fn on_paused(&self, _id: &str) {
            self.paused.fetch_add(1, Ordering::SeqCst);
        }
        fn on_resumed(&self, _id: &str) {
            self.resumed.fetch_add(1, Ordering::SeqCst);
        }
        fn on_redirected(&self, _id: &str, _task: &str) {
            self.redirected.fetch_add(1, Ordering::SeqCst);
        }
    }

    // ── PersonaControlHandle ──────────────────────────────────────────────

    #[tokio::test]
    async fn pair_sends_pause_resume_redirect_in_order() {
        let (handle, mut rx) = PersonaControlHandle::pair("dev");

        handle.pause().await.unwrap();
        handle.redirect("new-task".to_string()).await.unwrap();
        handle.resume().await.unwrap();

        assert!(matches!(rx.try_recv().unwrap(), ControlSignal::Pause));
        match rx.try_recv().unwrap() {
            ControlSignal::Redirect { task } => assert_eq!(task, "new-task"),
            other => panic!("expected Redirect, got {other:?}"),
        }
        assert!(matches!(rx.try_recv().unwrap(), ControlSignal::Resume));
    }

    #[tokio::test]
    async fn handle_is_alive_until_receiver_dropped() {
        let (handle, rx) = PersonaControlHandle::pair("dev");
        assert!(handle.is_alive(), "handle should be alive while rx exists");
        drop(rx);
        assert!(
            !handle.is_alive(),
            "handle should report dead after rx is dropped"
        );
    }

    #[tokio::test]
    async fn pause_returns_gone_when_receiver_dropped() {
        let (handle, rx) = PersonaControlHandle::pair("dev");
        drop(rx);
        assert_eq!(
            handle.pause().await,
            Err(PersonaGone),
            "pause must return PersonaGone when channel is closed"
        );
    }

    #[tokio::test]
    async fn resume_returns_gone_when_receiver_dropped() {
        let (handle, rx) = PersonaControlHandle::pair("dev");
        drop(rx);
        assert_eq!(handle.resume().await, Err(PersonaGone));
    }

    #[tokio::test]
    async fn redirect_returns_gone_when_receiver_dropped() {
        let (handle, rx) = PersonaControlHandle::pair("dev");
        drop(rx);
        assert_eq!(handle.redirect("task").await, Err(PersonaGone));
    }

    #[tokio::test]
    async fn handle_clone_shares_channel() {
        let (handle, mut rx) = PersonaControlHandle::pair("dev");
        let handle2 = handle.clone();

        handle.pause().await.unwrap();
        handle2.resume().await.unwrap();

        assert!(matches!(rx.try_recv().unwrap(), ControlSignal::Pause));
        assert!(matches!(rx.try_recv().unwrap(), ControlSignal::Resume));
    }

    // ── PersonaGone ───────────────────────────────────────────────────────

    #[test]
    fn persona_gone_display() {
        assert!(PersonaGone.to_string().contains("exited"));
    }

    // ── ControlNotifier constants ─────────────────────────────────────────

    #[test]
    fn event_type_constants_dot_namespaced() {
        assert!(EVENT_PAUSED.contains('.'));
        assert!(EVENT_RESUMED.contains('.'));
        assert!(EVENT_REDIRECTED.contains('.'));
    }

    // ── NullControlNotifier ───────────────────────────────────────────────

    #[test]
    fn null_notifier_is_noop() {
        // Should not panic.
        let n = NullControlNotifier;
        n.on_paused("dev");
        n.on_resumed("dev");
        n.on_redirected("dev", "task");
    }

    // ── RecordingControlNotifier ──────────────────────────────────────────

    #[test]
    fn recording_notifier_counts_calls() {
        let n = Arc::new(RecordingControlNotifier::default());
        n.on_paused("dev");
        n.on_paused("dev");
        n.on_resumed("dev");
        n.on_redirected("dev", "do x");

        assert_eq!(n.paused.load(Ordering::SeqCst), 2);
        assert_eq!(n.resumed.load(Ordering::SeqCst), 1);
        assert_eq!(n.redirected.load(Ordering::SeqCst), 1);
    }

    // ── PersonaState ──────────────────────────────────────────────────────

    #[test]
    fn persona_state_eq() {
        assert_eq!(PersonaState::Running, PersonaState::Running);
        assert_ne!(PersonaState::Running, PersonaState::Paused);
    }

    // ── Channel capacity ─────────────────────────────────────────────────
}
