//! Streaming IPC channel (D-1).
//!
//! Bus messages, persona stdout/stderr, and file-watch events flow
//! through this module rather than through Tauri commands so that
//! the front-end can subscribe to long-lived streams cleanly.
//!
//! ## Story 2.9 — bus relay → desktop UI bridge
//!
//! The `c4n-bus-relay` crate (Story 2.7) owns a broadcast hub: it
//! normalizes Paperclip's SSE events into [`c4n_bus_relay::BusEnvelope`]s
//! and fans them out to in-process subscribers. This module bridges that
//! hub to the Tauri webview:
//!
//! ```text
//!   Relay (broadcast::Sender)  ──subscribe()──▶  per-subscription tokio task
//!                                                         │ map → canonical
//!                                                         ▼
//!                                              Tauri Channel<UiBusEnvelope>
//!                                                         │
//!                                                         ▼
//!                                              webview (Story 2.10 panel)
//! ```
//!
//! - [`bus_subscribe`] hands the frontend a [`tauri::ipc::Channel`]; each
//!   relayed envelope is mapped to the canonical wire shape and pushed
//!   through it. Returns a subscription id.
//! - [`bus_unsubscribe`] tears a subscription's task down by id.
//!
//! **Envelope shape.** The relay crate's [`c4n_bus_relay::BusEnvelope`]
//! predates the canonical `@c4n/core` schema (Story 2.8) and uses
//! `{ v, type, from, ts: RFC-3339, id, payload }`. The frontend expects the
//! Story 2.8 wire shape `{ schemaVersion, id, source, ts: epoch-ms, type,
//! payload }`. [`UiBusEnvelope`] is that canonical shape; [`map_envelope`]
//! does the field rename + RFC-3339 → epoch-ms conversion so the webview
//! always sees the `@c4n/core` `BusEnvelope`.
//!
//! **Minimize/restore survival.** Subscriptions are plain tokio tasks
//! draining a `broadcast::Receiver` (capacity 1024). They keep running
//! regardless of window state, and Tauri's Channel delivery is queued — so
//! minimizing/restoring the window does not drop envelopes (a subscriber
//! that falls >1024 behind sees a logged `Lagged` and resumes; that only
//! happens under sustained overload, not a normal minimize).
//!
//! **Feeding the relay.** Story 2.9 wired the *subscribe* side; the live
//! Paperclip SSE connector that drives `Relay::run` lands in [`feeder`]
//! (NEVAAA-39). [`start_bus_feeder`] reads the endpoint + token from the
//! environment and spawns the supervision loop against this same
//! [`BusRelayState`] relay, so the producer attaches without touching the
//! subscribe path. Local producers can still publish synthetic events via
//! [`c4n_bus_relay::Relay::publish`].
//!
//! ## Story 2.11 — bus state survives Paperclip restart
//!
//! The feeder's supervision loop ([`c4n_bus_relay::Relay::run`]) reconnects
//! with exponential backoff (max 30 s) when Paperclip restarts, and publishes
//! its live [`ConnectionState`] onto a `watch` channel. [`bus_connection_subscribe`]
//! forwards those transitions (mapped to [`UiConnectionState`]) to the webview
//! so the channel panel can show a "reconnecting…" state plus the current
//! reconnect attempt count, then resume the live feed once `Connected` returns.

mod feeder;

use std::collections::HashMap;
use std::sync::{Arc, Mutex as StdMutex};

use c4n_bus_relay::{BusEnvelope, ConnectionState, Relay};
use serde::Serialize;
use tauri::ipc::Channel;
use tauri::State;
use tokio::sync::broadcast::error::RecvError;
use tokio::sync::Notify;

/// Canonical bus envelope wire shape consumed by the webview.
///
/// Matches `@c4n/core`'s `BusEnvelope` (Story 2.8): `schemaVersion`, `id`,
/// `source`, `ts` (Unix milliseconds), `type`, `payload`. Serialized field
/// names are renamed to the canonical JSON keys.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct UiBusEnvelope {
    /// Wire-format version (canonical `schemaVersion`).
    #[serde(rename = "schemaVersion")]
    pub schema_version: u32,
    /// Unique message id.
    pub id: String,
    /// Source identity that emitted the message (relay stamps `"paperclip"`).
    pub source: String,
    /// Producer timestamp, Unix milliseconds.
    pub ts: i64,
    /// Discriminant event type.
    #[serde(rename = "type")]
    pub event_type: String,
    /// Event-type-specific payload.
    pub payload: serde_json::Value,
}

/// Map a relay [`BusEnvelope`] onto the canonical [`UiBusEnvelope`].
///
/// `from` → `source`, `v` → `schemaVersion`, and the RFC-3339 `ts` string is
/// parsed to Unix milliseconds. A `ts` we can't parse falls back to "now" so
/// a malformed upstream timestamp never drops the whole envelope.
pub fn map_envelope(env: &BusEnvelope) -> UiBusEnvelope {
    let ts = chrono::DateTime::parse_from_rfc3339(&env.ts)
        .map(|dt| dt.timestamp_millis())
        .unwrap_or_else(|_| chrono::Utc::now().timestamp_millis());

    UiBusEnvelope {
        schema_version: env.v,
        id: env.id.clone(),
        source: env.from.clone(),
        ts,
        event_type: env.event_type.clone(),
        payload: env.payload.clone(),
    }
}

/// Tauri-managed state: the relay (IPC fan-out hub) plus per-subscription
/// shutdown handles so [`bus_unsubscribe`] can stop a single drain task.
///
/// One instance lives for the app's lifetime (registered via `manage` in
/// `lib.rs`), so every `bus_subscribe` shares the same relay and therefore
/// the same upstream event stream.
pub struct BusRelayState {
    relay: Arc<Relay>,
    subscriptions: StdMutex<HashMap<String, Arc<Notify>>>,
    /// Shutdown handles for connection-state stream tasks (Story 2.11),
    /// keyed the same way as `subscriptions`.
    state_subscriptions: StdMutex<HashMap<String, Arc<Notify>>>,
}

impl Default for BusRelayState {
    fn default() -> Self {
        BusRelayState {
            relay: Arc::new(Relay::new()),
            subscriptions: StdMutex::new(HashMap::new()),
            state_subscriptions: StdMutex::new(HashMap::new()),
        }
    }
}

/// Connection-state wire shape consumed by the webview status bar (Story 2.11).
///
/// An internally-tagged enum so the frontend can switch on `state`:
/// `{ "state": "connecting" }`, `{ "state": "connected" }`, or
/// `{ "state": "reconnecting", "attempt": 2, "delayMs": 2000 }`.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(tag = "state", rename_all = "lowercase")]
pub enum UiConnectionState {
    /// Establishing the first connection — no live stream yet.
    Connecting,
    /// A stream is live; bus traffic is flowing.
    Connected,
    /// Disconnected; backing off `delay_ms` ms before reconnect `attempt`.
    Reconnecting {
        /// 1-based reconnect attempt count, shown in the panel status bar.
        attempt: u64,
        /// Backoff delay before the next attempt, milliseconds.
        #[serde(rename = "delayMs")]
        delay_ms: u64,
    },
}

/// Map the relay's [`ConnectionState`] onto the [`UiConnectionState`] wire shape.
pub fn map_connection_state(state: &ConnectionState) -> UiConnectionState {
    match state {
        ConnectionState::Connecting => UiConnectionState::Connecting,
        ConnectionState::Connected => UiConnectionState::Connected,
        ConnectionState::Reconnecting { attempt, delay_ms } => UiConnectionState::Reconnecting {
            attempt: *attempt,
            delay_ms: *delay_ms,
        },
    }
}

/// Spawn the live Paperclip SSE feeder (NEVAAA-39) against the shared relay.
///
/// Reads the endpoint URL + auth token from the environment via
/// [`feeder::FeederConfig::from_env`]. When no endpoint is configured this is a
/// logged no-op, so the desktop runs fine without a live Paperclip backend.
/// Called once from the Tauri `setup` hook in `lib.rs`.
pub fn start_bus_feeder(state: &BusRelayState) {
    let Some(config) = feeder::FeederConfig::from_env() else {
        tracing::info!(
            "bus-relay feeder: no Paperclip SSE endpoint configured (C4N_PAPERCLIP_SSE_URL unset); relay idle"
        );
        return;
    };

    let relay = state.relay.clone();
    tauri::async_runtime::spawn(feeder::run_feeder(relay, config));
}

/// Drive one subscription: drain `rx`, map each envelope, hand it to `sink`.
/// Stops when `notify` fires (unsubscribe), the sink reports the consumer is
/// gone (`false`), or the relay channel closes.
///
/// Factored out of [`bus_subscribe`] so the relay → UI path is testable
/// without a live Tauri Channel: tests pass a closure sink.
async fn drain_subscription<F>(
    mut rx: tokio::sync::broadcast::Receiver<BusEnvelope>,
    notify: Arc<Notify>,
    mut sink: F,
) where
    F: FnMut(UiBusEnvelope) -> bool,
{
    loop {
        tokio::select! {
            _ = notify.notified() => break,
            res = rx.recv() => match res {
                Ok(env) => {
                    if !sink(map_envelope(&env)) {
                        // Consumer (the webview Channel) is gone.
                        break;
                    }
                }
                // Slow subscriber fell behind the 1024-deep buffer. Log and
                // keep going — recv() resyncs to the oldest retained message.
                Err(RecvError::Lagged(n)) => {
                    tracing::warn!("bus_subscribe: lagged, dropped {n} envelope(s)");
                    continue;
                }
                // The relay's sender was dropped (app teardown).
                Err(RecvError::Closed) => break,
            }
        }
    }
}

/// Subscribe the frontend to live bus traffic.
///
/// Opens a per-subscription drain task that forwards every relayed envelope
/// (mapped to the canonical [`UiBusEnvelope`]) into `on_event`. Returns a
/// subscription id the frontend passes back to [`bus_unsubscribe`] on
/// teardown.
#[tauri::command]
pub async fn bus_subscribe(
    on_event: Channel<UiBusEnvelope>,
    state: State<'_, BusRelayState>,
) -> Result<String, String> {
    let subscription_id = uuid::Uuid::new_v4().to_string();
    let rx = state.relay.subscribe();

    let notify = Arc::new(Notify::new());
    {
        let mut subs = state
            .subscriptions
            .lock()
            .map_err(|e| format!("bus subscriptions lock poisoned: {e}"))?;
        subs.insert(subscription_id.clone(), notify.clone());
    }

    tokio::spawn(async move {
        drain_subscription(rx, notify, move |env| on_event.send(env).is_ok()).await;
    });

    Ok(subscription_id)
}

/// Tear down a subscription by id. Idempotent: unknown ids are a no-op.
#[tauri::command]
pub fn bus_unsubscribe(
    subscription_id: String,
    state: State<'_, BusRelayState>,
) -> Result<(), String> {
    let mut subs = state
        .subscriptions
        .lock()
        .map_err(|e| format!("bus subscriptions lock poisoned: {e}"))?;
    if let Some(notify) = subs.remove(&subscription_id) {
        notify.notify_one();
    }
    Ok(())
}

/// Drive one connection-state stream: emit the current state immediately, then
/// each transition, into `sink`. Stops when `notify` fires (unsubscribe), the
/// sink reports the consumer is gone (`false`), or the relay's state sender is
/// dropped (app teardown).
///
/// Factored out of [`bus_connection_subscribe`] so the relay → UI status path
/// is testable without a live Tauri Channel.
async fn drain_connection_state<F>(
    mut rx: tokio::sync::watch::Receiver<ConnectionState>,
    notify: Arc<Notify>,
    mut sink: F,
) where
    F: FnMut(UiConnectionState) -> bool,
{
    // Emit the current state right away so a late subscriber paints the
    // correct status immediately rather than waiting for the next transition.
    if !sink(map_connection_state(&rx.borrow().clone())) {
        return;
    }
    loop {
        tokio::select! {
            _ = notify.notified() => break,
            res = rx.changed() => match res {
                Ok(()) => {
                    let state = rx.borrow().clone();
                    if !sink(map_connection_state(&state)) {
                        break;
                    }
                }
                // The relay's state sender was dropped (app teardown).
                Err(_) => break,
            }
        }
    }
}

/// Subscribe the frontend to live relay connection-state transitions (Story
/// 2.11). The current state is delivered immediately, then every transition.
/// Returns a subscription id for [`bus_connection_unsubscribe`].
#[tauri::command]
pub async fn bus_connection_subscribe(
    on_state: Channel<UiConnectionState>,
    state: State<'_, BusRelayState>,
) -> Result<String, String> {
    let subscription_id = uuid::Uuid::new_v4().to_string();
    let rx = state.relay.connection_state();

    let notify = Arc::new(Notify::new());
    {
        let mut subs = state
            .state_subscriptions
            .lock()
            .map_err(|e| format!("bus state subscriptions lock poisoned: {e}"))?;
        subs.insert(subscription_id.clone(), notify.clone());
    }

    tokio::spawn(async move {
        drain_connection_state(rx, notify, move |s| on_state.send(s).is_ok()).await;
    });

    Ok(subscription_id)
}

/// Tear down a connection-state subscription by id. Idempotent.
#[tauri::command]
pub fn bus_connection_unsubscribe(
    subscription_id: String,
    state: State<'_, BusRelayState>,
) -> Result<(), String> {
    let mut subs = state
        .state_subscriptions
        .lock()
        .map_err(|e| format!("bus state subscriptions lock poisoned: {e}"))?;
    if let Some(notify) = subs.remove(&subscription_id) {
        notify.notify_one();
    }
    Ok(())
}

/// Publish an envelope from the desktop UI back onto the bus relay.
/// This enables the frontend to emit events (e.g., spawn_proposal_rejected)
/// that the relay fans out to all subscribers, including the Paperclip SSE
/// upstream so Hermes receives the response.
#[tauri::command]
pub fn bus_publish(
    event_type: String,
    payload: serde_json::Value,
    state: State<'_, BusRelayState>,
) -> Result<String, String> {
    let envelope = BusEnvelope {
        v: c4n_bus_relay::ENVELOPE_VERSION,
        event_type,
        from: "desktop".into(),
        ts: chrono::Utc::now().to_rfc3339(),
        id: uuid::Uuid::new_v4().to_string(),
        payload,
    };
    state.relay.publish(envelope.clone());
    Ok(envelope.id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn relay_envelope() -> BusEnvelope {
        BusEnvelope {
            v: c4n_bus_relay::ENVELOPE_VERSION,
            event_type: "agent.message".into(),
            from: "paperclip".into(),
            ts: "2026-05-29T12:00:00Z".into(),
            id: "id-1".into(),
            payload: json!({ "channel": "stdout", "text": "hi" }),
        }
    }

    // map_envelope renames fields and converts RFC-3339 → epoch ms.
    #[test]
    fn maps_relay_envelope_to_canonical_shape() {
        let ui = map_envelope(&relay_envelope());
        assert_eq!(ui.schema_version, 1);
        assert_eq!(ui.id, "id-1");
        assert_eq!(ui.source, "paperclip");
        assert_eq!(ui.event_type, "agent.message");
        // 2026-05-29T12:00:00Z = 1780056000000 ms.
        assert_eq!(ui.ts, 1_780_056_000_000);
        assert_eq!(ui.payload["text"], "hi");
    }

    // map_envelope serializes to the canonical @c4n/core JSON keys.
    #[test]
    fn serializes_to_canonical_json_keys() {
        let ui = map_envelope(&relay_envelope());
        let v = serde_json::to_value(&ui).unwrap();
        assert_eq!(v["schemaVersion"], 1);
        assert_eq!(v["source"], "paperclip");
        assert_eq!(v["type"], "agent.message");
        assert!(v.get("from").is_none());
        assert!(v.get("v").is_none());
        assert!(v["ts"].is_number());
    }

    // A bad upstream ts falls back to "now" rather than dropping the envelope.
    #[test]
    fn unparseable_ts_falls_back_to_now() {
        let mut env = relay_envelope();
        env.ts = "not-a-timestamp".into();
        let before = chrono::Utc::now().timestamp_millis();
        let ui = map_envelope(&env);
        assert!(ui.ts >= before);
    }

    // AC (Story 2.9) integration: emit a synthetic bus event, assert the UI
    // listener (the drain sink standing in for the Tauri Channel) fires with
    // the mapped envelope. Exercises Relay → subscribe → drain → sink.
    #[tokio::test]
    async fn synthetic_event_reaches_ui_listener() {
        let relay = Arc::new(Relay::new());
        let rx = relay.subscribe();

        let (tx, mut rx_ui) = tokio::sync::mpsc::unbounded_channel();
        let notify = Arc::new(Notify::new());
        let drain_notify = notify.clone();
        let task = tokio::spawn(async move {
            drain_subscription(rx, drain_notify, move |env| tx.send(env).is_ok()).await;
        });

        // Emit a synthetic bus event onto the relay's IPC fan-out.
        relay.publish(relay_envelope());

        // The UI listener fires with the canonical envelope.
        let ui = rx_ui.recv().await.expect("UI listener should fire");
        assert_eq!(ui.event_type, "agent.message");
        assert_eq!(ui.source, "paperclip");
        assert_eq!(ui.schema_version, 1);
        assert_eq!(ui.payload["text"], "hi");

        // Unsubscribe stops the drain task.
        notify.notify_one();
        task.await.unwrap();
    }

    // map_connection_state serializes to the internally-tagged wire shape the
    // status bar switches on (Story 2.11).
    #[test]
    fn connection_state_serializes_to_tagged_wire_shape() {
        let connected = serde_json::to_value(map_connection_state(&ConnectionState::Connected)).unwrap();
        assert_eq!(connected["state"], "connected");

        let reconnecting = serde_json::to_value(map_connection_state(
            &ConnectionState::Reconnecting { attempt: 2, delay_ms: 2000 },
        ))
        .unwrap();
        assert_eq!(reconnecting["state"], "reconnecting");
        assert_eq!(reconnecting["attempt"], 2);
        assert_eq!(reconnecting["delayMs"], 2000);
    }

    // AC (Story 2.11): the connection-state stream delivers the current state
    // immediately, then each transition the relay's run() loop publishes.
    #[tokio::test]
    async fn connection_state_stream_delivers_current_then_transitions() {
        let relay = Arc::new(Relay::new());
        let rx = relay.connection_state();

        let (tx, mut rx_ui) = tokio::sync::mpsc::unbounded_channel();
        let notify = Arc::new(Notify::new());
        let drain_notify = notify.clone();
        let task = tokio::spawn(async move {
            drain_connection_state(rx, drain_notify, move |s| tx.send(s).is_ok()).await;
        });

        // The current state (Connecting) is delivered immediately.
        let first = rx_ui.recv().await.expect("current state delivered");
        assert_eq!(first, UiConnectionState::Connecting);

        // Drive a finite supervision loop so the relay publishes Connected then
        // Reconnecting transitions onto its watch channel.
        let connect = || async {
            Ok::<_, c4n_bus_relay::RelayError>(tokio::io::BufReader::new(
                "event: agent.message\nid: 1\ndata: {}\n\n".as_bytes(),
            ))
        };
        relay
            .run(
                connect,
                c4n_bus_relay::RetryPolicy {
                    initial_delay: std::time::Duration::from_millis(1),
                    max_delay: std::time::Duration::from_millis(2),
                    multiplier: 2,
                    max_reconnects: Some(1),
                },
            )
            .await
            .unwrap();

        // We must observe Connected over the stream after the initial state.
        let mut saw_connected = false;
        while let Ok(Some(s)) =
            tokio::time::timeout(std::time::Duration::from_millis(200), rx_ui.recv()).await
        {
            if s == UiConnectionState::Connected {
                saw_connected = true;
                break;
            }
        }
        assert!(saw_connected, "stream should report Connected after link-up");

        notify.notify_one();
        task.await.unwrap();
    }

    // bus_connection_unsubscribe's notify stops a live state drain task.
    #[tokio::test]
    async fn connection_state_unsubscribe_stops_task() {
        let relay = Arc::new(Relay::new());
        let rx = relay.connection_state();
        let notify = Arc::new(Notify::new());
        let drain_notify = notify.clone();

        let task = tokio::spawn(async move {
            drain_connection_state(rx, drain_notify, |_| true).await;
        });

        notify.notify_one();
        tokio::time::timeout(std::time::Duration::from_secs(1), task)
            .await
            .expect("state drain task should stop after unsubscribe")
            .unwrap();
    }

    // bus_unsubscribe's notify stops a live drain task.
    #[tokio::test]
    async fn unsubscribe_stops_drain_task() {
        let relay = Arc::new(Relay::new());
        let rx = relay.subscribe();
        let notify = Arc::new(Notify::new());
        let drain_notify = notify.clone();

        let task = tokio::spawn(async move {
            drain_subscription(rx, drain_notify, |_| true).await;
        });

        notify.notify_one();
        // Task must terminate promptly after notify.
        tokio::time::timeout(std::time::Duration::from_secs(1), task)
            .await
            .expect("drain task should stop after unsubscribe")
            .unwrap();
    }
}
