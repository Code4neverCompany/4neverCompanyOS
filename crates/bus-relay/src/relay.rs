//! The relay: Paperclip SSE stream → bus envelopes → IPC subscribers.
//!
//! [`Relay`] owns a [`tokio::sync::broadcast`] channel — the named, in-process
//! IPC fan-out. Local consumers (desktop UI panes via the Tauri IPC bridge in
//! `apps/desktop/src-tauri/src/ipc/`, the WebSocket relay landing in Story 2.9,
//! progress-signal subscribers, the stall detector) each call
//! [`Relay::subscribe`] to receive every envelope the relay publishes.
//!
//! ## Lifecycle
//!
//! - [`Relay::pump`] drives a single connected stream to EOF, normalizing each
//!   SSE frame into a [`BusEnvelope`] and broadcasting it.
//! - [`Relay::run`] wraps `pump` with connect / reconnect supervision: it calls
//!   the supplied connector, pumps the resulting stream, and on disconnect (or
//!   connect failure) waits per the [`RetryPolicy`] backoff and reconnects.
//!
//! The connector is a caller-supplied closure rather than a baked-in HTTP
//! client. Production wiring passes a closure that opens the Paperclip SSE
//! endpoint (HTTP/TLS); tests pass a closure that hands back in-memory buffers.
//! This keeps the crate's dependency surface minimal and the reconnect logic
//! fully unit-testable.

use std::future::Future;
use std::time::Duration;

use tokio::io::AsyncBufRead;
use tokio::sync::broadcast;
use tracing::{debug, info, warn};

use crate::envelope::BusEnvelope;
use crate::sse;
use crate::RelayError;

/// Default capacity of the broadcast (IPC) channel. Slow subscribers that fall
/// this far behind will see `RecvError::Lagged`; that's preferable to
/// unbounded memory growth on the relay.
pub const DEFAULT_CHANNEL_CAPACITY: usize = 1024;

/// Reconnection backoff policy for [`Relay::run`].
#[derive(Debug, Clone)]
pub struct RetryPolicy {
    /// Delay before the first reconnect attempt.
    pub initial_delay: Duration,
    /// Upper bound on the backoff delay.
    pub max_delay: Duration,
    /// Multiplier applied to the delay after each reconnect.
    pub multiplier: u32,
    /// Stop after this many reconnect cycles. `None` runs forever (production);
    /// tests set a finite bound so `run` terminates.
    pub max_reconnects: Option<usize>,
}

impl Default for RetryPolicy {
    fn default() -> Self {
        RetryPolicy {
            initial_delay: Duration::from_millis(500),
            max_delay: Duration::from_secs(30),
            multiplier: 2,
            max_reconnects: None,
        }
    }
}

/// Running totals reported by [`Relay::run`].
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct RelayStats {
    /// Successful connections established.
    pub connects: u64,
    /// Connection attempts that failed before yielding a stream.
    pub connect_failures: u64,
    /// Reconnect cycles entered (each disconnect or connect failure).
    pub reconnects: u64,
    /// Total envelopes relayed across all connections.
    pub frames_relayed: u64,
}

/// Fan-out hub: subscribes to Paperclip events and re-publishes them onto the
/// IPC broadcast channel.
pub struct Relay {
    tx: broadcast::Sender<BusEnvelope>,
}

impl Default for Relay {
    fn default() -> Self {
        Relay::new()
    }
}

impl Relay {
    /// Create a relay with the default channel capacity.
    pub fn new() -> Self {
        Relay::with_capacity(DEFAULT_CHANNEL_CAPACITY)
    }

    /// Create a relay with a custom broadcast channel capacity.
    pub fn with_capacity(capacity: usize) -> Self {
        let (tx, _rx) = broadcast::channel(capacity);
        Relay { tx }
    }

    /// Subscribe to the IPC channel. Each subscriber receives every envelope
    /// published after it subscribes.
    pub fn subscribe(&self) -> broadcast::Receiver<BusEnvelope> {
        self.tx.subscribe()
    }

    /// Number of currently-active subscribers.
    pub fn subscriber_count(&self) -> usize {
        self.tx.receiver_count()
    }

    /// Publish an envelope directly onto the IPC fan-out, bypassing the SSE
    /// pump. Used by local producers that aren't Paperclip's event stream —
    /// the desktop's synthetic-event seam (Story 2.9) and integration tests.
    /// As with [`pump`], a send with zero subscribers is not an error: the
    /// envelope is dropped and the relay keeps running.
    pub fn publish(&self, envelope: BusEnvelope) {
        if self.tx.send(envelope).is_err() {
            debug!("bus-relay: publish dropped — no IPC subscribers");
        }
    }

    /// Drive one connected stream to EOF, broadcasting each frame as an
    /// envelope. Returns the number of frames relayed. `Ok` means the stream
    /// ended cleanly (the peer disconnected); callers reconnect via [`run`].
    pub async fn pump<R: AsyncBufRead + Unpin>(
        &self,
        reader: &mut R,
    ) -> Result<u64, RelayError> {
        let mut count = 0u64;
        while let Some(frame) = sse::next_frame(reader).await? {
            let envelope = BusEnvelope::from_sse(&frame);
            // `send` errors only when there are zero subscribers. That's not a
            // relay failure — consumers attach and detach over the relay's
            // lifetime — so we drop the envelope and keep pumping.
            if self.tx.send(envelope).is_err() {
                debug!("bus-relay: no IPC subscribers; envelope dropped");
            }
            count += 1;
        }
        Ok(count)
    }

    /// Connect → pump → reconnect supervision loop.
    ///
    /// Calls `connect` to obtain a stream, pumps it, and on disconnect (clean
    /// EOF, stream error, or connect failure) backs off per `retry` and tries
    /// again. The backoff resets to `initial_delay` after every successful
    /// connection. Terminates when `retry.max_reconnects` is reached.
    pub async fn run<F, Fut, R>(
        &self,
        mut connect: F,
        retry: RetryPolicy,
    ) -> Result<RelayStats, RelayError>
    where
        F: FnMut() -> Fut,
        Fut: Future<Output = Result<R, RelayError>>,
        R: AsyncBufRead + Unpin,
    {
        let mut stats = RelayStats::default();
        let mut delay = retry.initial_delay;

        loop {
            match connect().await {
                Ok(mut reader) => {
                    stats.connects += 1;
                    delay = retry.initial_delay; // reset backoff on success
                    info!("bus-relay: connected to Paperclip event stream");
                    match self.pump(&mut reader).await {
                        Ok(n) => {
                            stats.frames_relayed += n;
                            warn!(
                                frames = n,
                                "bus-relay: Paperclip stream disconnected; reconnecting"
                            );
                        }
                        Err(e) => {
                            warn!(error = %e, "bus-relay: stream error; reconnecting");
                        }
                    }
                }
                Err(e) => {
                    stats.connect_failures += 1;
                    warn!(error = %e, "bus-relay: connect failed; retrying");
                }
            }

            stats.reconnects += 1;
            if let Some(max) = retry.max_reconnects {
                if stats.reconnects as usize >= max {
                    return Ok(stats);
                }
            }

            tokio::time::sleep(delay).await;
            delay = (delay * retry.multiplier).min(retry.max_delay);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;
    use tokio::io::BufReader;

    const ONE_FRAME: &str = "event: agent.message\nid: 1\ndata: {\"text\":\"hi\"}\n\n";

    fn fast_retry(max: usize) -> RetryPolicy {
        RetryPolicy {
            initial_delay: Duration::from_millis(1),
            max_delay: Duration::from_millis(2),
            multiplier: 2,
            max_reconnects: Some(max),
        }
    }

    // AC: connect + receive event + rebroadcast.
    #[tokio::test]
    async fn pump_rebroadcasts_to_subscriber() {
        let relay = Relay::new();
        let mut rx = relay.subscribe();

        let mut reader = BufReader::new(ONE_FRAME.as_bytes());
        let n = relay.pump(&mut reader).await.unwrap();
        assert_eq!(n, 1);

        let env = rx.recv().await.unwrap();
        assert_eq!(env.event_type, "agent.message");
        assert_eq!(env.from, "paperclip");
        assert_eq!(env.payload["text"], "hi");
    }

    // AC: rebroadcast reaches every subscriber (fan-out).
    #[tokio::test]
    async fn rebroadcasts_to_all_subscribers() {
        let relay = Relay::new();
        let mut rx1 = relay.subscribe();
        let mut rx2 = relay.subscribe();
        assert_eq!(relay.subscriber_count(), 2);

        let mut reader = BufReader::new("data: x\n\n".as_bytes());
        relay.pump(&mut reader).await.unwrap();

        assert_eq!(rx1.recv().await.unwrap().payload, "x");
        assert_eq!(rx2.recv().await.unwrap().payload, "x");
    }

    // AC (Story 2.9): local producers can publish straight onto the IPC
    // fan-out without going through the SSE pump.
    #[tokio::test]
    async fn publish_reaches_subscriber() {
        let relay = Relay::new();
        let mut rx = relay.subscribe();

        let env = BusEnvelope {
            v: crate::ENVELOPE_VERSION,
            event_type: "agent.message".into(),
            from: "paperclip".into(),
            ts: "2026-05-29T12:00:00Z".into(),
            id: "id-1".into(),
            payload: serde_json::json!({ "text": "hi" }),
        };
        relay.publish(env.clone());

        assert_eq!(rx.recv().await.unwrap(), env);
    }

    // publish with no subscribers must not panic or error.
    #[tokio::test]
    async fn publish_without_subscribers_is_ok() {
        let relay = Relay::new();
        relay.publish(BusEnvelope {
            v: crate::ENVELOPE_VERSION,
            event_type: "ping".into(),
            from: "paperclip".into(),
            ts: "2026-05-29T12:00:00Z".into(),
            id: "id-2".into(),
            payload: serde_json::Value::Null,
        });
    }

    // No subscribers must not be an error.
    #[tokio::test]
    async fn pump_without_subscribers_is_ok() {
        let relay = Relay::new();
        let mut reader = BufReader::new(ONE_FRAME.as_bytes());
        assert_eq!(relay.pump(&mut reader).await.unwrap(), 1);
    }

    // AC: disconnect + reconnect. The connector hands back a fresh single-frame
    // stream on each call; each stream ends in EOF (a disconnect), so the relay
    // reconnects until the bound is hit.
    #[tokio::test]
    async fn run_reconnects_after_each_disconnect() {
        let relay = Relay::new();
        let mut rx = relay.subscribe();

        let connect = || async { Ok::<_, RelayError>(BufReader::new(ONE_FRAME.as_bytes())) };
        let stats = relay.run(connect, fast_retry(3)).await.unwrap();

        assert_eq!(stats.connects, 3);
        assert_eq!(stats.reconnects, 3);
        assert_eq!(stats.frames_relayed, 3);
        assert_eq!(stats.connect_failures, 0);

        // Three frames were broadcast.
        for _ in 0..3 {
            assert_eq!(rx.recv().await.unwrap().event_type, "agent.message");
        }
    }

    // AC: reconnect after a failed connect (transient outage), then recover.
    #[tokio::test]
    async fn run_retries_on_connect_failure_then_recovers() {
        let relay = Relay::new();
        let attempts = Arc::new(AtomicUsize::new(0));

        let connect = {
            let attempts = attempts.clone();
            move || {
                let attempts = attempts.clone();
                async move {
                    let n = attempts.fetch_add(1, Ordering::SeqCst);
                    if n == 0 {
                        // First attempt: Paperclip not reachable yet.
                        Err(RelayError::Connect("refused".into()))
                    } else {
                        Ok(BufReader::new(ONE_FRAME.as_bytes()))
                    }
                }
            }
        };

        let stats = relay.run(connect, fast_retry(2)).await.unwrap();
        assert_eq!(stats.connect_failures, 1);
        assert_eq!(stats.connects, 1);
        assert_eq!(stats.frames_relayed, 1);
    }
}
