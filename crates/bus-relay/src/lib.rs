//! c4n-bus-relay — Bus relay sidecar (D-3).
//!
//! Subscribes to Paperclip's event system (a Server-Sent Events stream),
//! normalizes each event into the shared bus envelope, and re-broadcasts it
//! onto a named in-process IPC channel so desktop UI panes and other local
//! consumers can receive live bus traffic.
//!
//! Architecture: D-3 (bus over IPC + WebSocket).
//! Implementing stories: M2 Story 2.7 (this) → Story 2.9 (WebSocket relay
//! consumes [`Relay::subscribe`]) → Stories 2.10/2.11 (subscriber UI).
//!
//! ## Data flow
//!
//! ```text
//!   Paperclip SSE  ──connect──▶  sse::next_frame  ──normalize──▶  BusEnvelope
//!                                                                      │
//!                                                          broadcast::Sender
//!                                                                      │
//!        ┌──────────────────────────┬──────────────────────────┐──────┘
//!     UI pane                 WebSocket relay (2.9)        progress-signal / stall
//! ```
//!
//! ## Module map
//!
//! - [`envelope`] — the `{ v, type, from, ts, id, payload }` bus frame and the
//!   SSE→envelope normalization (architecture.md §5).
//! - [`sse`] — generic `text/event-stream` parser over any [`tokio::io::AsyncBufRead`].
//! - [`relay`] — [`Relay`]: the broadcast (IPC) hub plus the connect / pump /
//!   reconnect supervision loop.
//!
//! ## Usage sketch (production)
//!
//! ```no_run
//! use c4n_bus_relay::{Relay, RetryPolicy, RelayError};
//! use tokio::io::BufReader;
//! # async fn run() -> Result<(), RelayError> {
//! let relay = Relay::new();
//! let _rx = relay.subscribe(); // hand to the IPC / WebSocket layer
//!
//! // `connect` opens the Paperclip SSE endpoint and returns an AsyncBufRead.
//! // (Here a placeholder reader stands in for the real HTTP/TLS stream.)
//! relay
//!     .run(
//!         || async { Ok(BufReader::new(&b""[..])) },
//!         RetryPolicy::default(),
//!     )
//!     .await?;
//! # Ok(()) }
//! ```
//!
//! The actual HTTP/TLS connector and the named-pipe IPC fan-out wiring live in
//! the desktop sidecar (D-1, Story 2.9); this crate stays transport-agnostic so
//! its reconnect and normalization logic is unit-testable in isolation.

mod envelope;
mod relay;
mod sse;

pub use envelope::{BusEnvelope, ENVELOPE_VERSION, RELAY_ORIGIN};
pub use relay::{ConnectionState, Relay, RelayStats, RetryPolicy, DEFAULT_CHANNEL_CAPACITY};
pub use sse::{next_frame, SseFrame};

/// Errors the relay can produce.
#[derive(Debug, thiserror::Error)]
pub enum RelayError {
    /// I/O error reading the event stream.
    #[error("io: {0}")]
    Io(String),

    /// The connector failed to establish a connection to Paperclip's event
    /// stream. The supervision loop in [`Relay::run`] retries per its
    /// [`RetryPolicy`].
    #[error("connect: {0}")]
    Connect(String),
}

/// Returns the crate's identity string. Used by tests and module-presence checks.
pub fn package_name() -> &'static str {
    "c4n-bus-relay"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn package_name_is_correct() {
        assert_eq!(package_name(), "c4n-bus-relay");
    }
}
