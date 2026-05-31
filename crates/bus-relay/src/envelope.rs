//! The bus envelope (D-3 / D-1 shared frame).
//!
//! Every message the relay puts on the IPC channel is wrapped in this frame,
//! per architecture.md §5 "Internal message envelopes (bus + IPC)":
//!
//! ```json
//! { "v": 1, "type": "...", "from": "...", "ts": "ISO-8601", "id": "uuid", "payload": {...} }
//! ```
//!
//! - `v`       — schema version; bumped only on breaking changes.
//! - `type`    — event type (dot-namespaced, e.g. `agent.message`).
//! - `from`    — origin of the message. The relay stamps `"paperclip"` because
//!               every envelope it produces originates from Paperclip's event
//!               stream.
//! - `ts`      — ISO-8601 / RFC-3339 timestamp.
//! - `id`      — UUID for de-dup and trace.
//! - `payload` — type-specific body.

use serde::{Deserialize, Serialize};

use crate::sse::SseFrame;

/// Current bus envelope schema version. Bumped only on breaking changes.
pub const ENVELOPE_VERSION: u32 = 1;

/// `from` value the relay stamps on every envelope it emits. All relayed
/// traffic originates from Paperclip's event system.
pub const RELAY_ORIGIN: &str = "paperclip";

/// The frame wrapping every message on the bus + IPC channel.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BusEnvelope {
    /// Schema version.
    pub v: u32,
    /// Event type (dot-namespaced).
    #[serde(rename = "type")]
    pub event_type: String,
    /// Message origin.
    pub from: String,
    /// ISO-8601 / RFC-3339 timestamp.
    pub ts: String,
    /// UUID for de-dup / trace.
    pub id: String,
    /// Type-specific body.
    pub payload: serde_json::Value,
}

impl BusEnvelope {
    /// Normalize a Paperclip SSE frame into a bus envelope.
    ///
    /// - `type` comes from the SSE `event:` field, defaulting to `"message"`
    ///   (the SSE spec's default event type) when absent.
    /// - `id` reuses the SSE `id:` field if Paperclip supplied one (preserving
    ///   the upstream trace id); otherwise a fresh UUID v4 is minted.
    /// - `ts` is stamped at relay time. The relay is the first component in our
    ///   trust boundary that timestamps the event in our own clock domain.
    /// - `payload` is the SSE `data:` parsed as JSON. If the data isn't valid
    ///   JSON it's preserved verbatim as a JSON string so nothing is lost.
    pub fn from_sse(frame: &SseFrame) -> Self {
        let payload = serde_json::from_str(&frame.data)
            .unwrap_or_else(|_| serde_json::Value::String(frame.data.clone()));

        let event_type = frame.event.clone().unwrap_or_else(|| "message".to_string());

        let id = frame
            .id
            .clone()
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

        BusEnvelope {
            v: ENVELOPE_VERSION,
            event_type,
            from: RELAY_ORIGIN.to_string(),
            ts: chrono::Utc::now().to_rfc3339(),
            id,
            payload,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_full_sse_frame() {
        let frame = SseFrame {
            event: Some("agent.message".to_string()),
            id: Some("upstream-id-1".to_string()),
            data: r#"{"text":"hello"}"#.to_string(),
            retry: None,
        };
        let env = BusEnvelope::from_sse(&frame);

        assert_eq!(env.v, ENVELOPE_VERSION);
        assert_eq!(env.event_type, "agent.message");
        assert_eq!(env.from, RELAY_ORIGIN);
        // Upstream trace id is preserved rather than regenerated.
        assert_eq!(env.id, "upstream-id-1");
        assert_eq!(env.payload["text"], "hello");
        assert!(!env.ts.is_empty());
    }

    #[test]
    fn defaults_type_and_mints_id_when_absent() {
        let frame = SseFrame {
            event: None,
            id: None,
            data: r#"{"k":1}"#.to_string(),
            retry: None,
        };
        let env = BusEnvelope::from_sse(&frame);

        assert_eq!(env.event_type, "message");
        // A UUID v4 was minted (36 chars, hyphenated).
        assert_eq!(env.id.len(), 36);
        assert_eq!(env.payload["k"], 1);
    }

    #[test]
    fn preserves_non_json_data_as_string() {
        let frame = SseFrame {
            event: Some("ping".to_string()),
            id: None,
            data: "not-json".to_string(),
            retry: None,
        };
        let env = BusEnvelope::from_sse(&frame);
        assert_eq!(
            env.payload,
            serde_json::Value::String("not-json".to_string())
        );
    }

    #[test]
    fn round_trips_through_json_with_renamed_type_field() {
        let frame = SseFrame {
            event: Some("x.y".to_string()),
            id: Some("id-1".to_string()),
            data: r#"{"a":true}"#.to_string(),
            retry: None,
        };
        let env = BusEnvelope::from_sse(&frame);
        let json = serde_json::to_value(&env).unwrap();
        // The wire field is `type`, not `event_type`.
        assert_eq!(json["type"], "x.y");
        assert_eq!(json["v"], ENVELOPE_VERSION);

        let back: BusEnvelope = serde_json::from_value(json).unwrap();
        assert_eq!(back, env);
    }
}
