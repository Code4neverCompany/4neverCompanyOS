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
//! **Feeding the relay.** This story wires the *subscribe* side. The live
//! Paperclip SSE connector that drives `Relay::run` is a follow-up; until
//! then local producers publish onto the relay via
//! [`c4n_bus_relay::Relay::publish`]. The feeder attaches to the same
//! [`BusRelayState`] relay so it can drive `Relay::run` without touching the
//! subscribe path.

use std::collections::HashMap;
use std::sync::{Arc, Mutex as StdMutex};

use c4n_bus_relay::{BusEnvelope, Relay};
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
}

impl Default for BusRelayState {
    fn default() -> Self {
        BusRelayState {
            relay: Arc::new(Relay::new()),
            subscriptions: StdMutex::new(HashMap::new()),
        }
    }
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
