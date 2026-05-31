//! Live Paperclip SSE feeder (NEVAAA-39).
//!
//! Story 2.9 wired the *subscribe* side of the bus relay (`bus_subscribe` /
//! `bus_unsubscribe` in [`super`]). This module supplies the *producer* side:
//! the HTTP/TLS connector that opens Paperclip's `text/event-stream` endpoint
//! and the supervision loop that drives [`c4n_bus_relay::Relay::run`] against
//! the shared [`super::BusRelayState`] relay.
//!
//! ```text
//!   Paperclip SSE (HTTP/TLS)
//!         │  reqwest GET, Accept: text/event-stream, Bearer auth
//!         ▼
//!   bytes_stream  ──StreamReader──▶  BufReader (AsyncBufRead)
//!         │
//!         ▼
//!   Relay::run(connect, RetryPolicy)  ──▶  broadcast hub  ──▶  bus_subscribe
//! ```
//!
//! ## Configuration (never hard-coded)
//!
//! The endpoint URL and auth token come from the environment:
//!   - `C4N_PAPERCLIP_SSE_URL` — the SSE endpoint (required to start the feeder).
//!   - `C4N_PAPERCLIP_TOKEN`   — bearer token sent as `Authorization: Bearer …`.
//!
//! When `C4N_PAPERCLIP_SSE_URL` is unset the feeder stays idle and the desktop
//! runs normally without a live Paperclip backend (local producers can still
//! `publish` onto the relay). The token is read straight from the environment
//! and only ever lives in the request header — it is never logged.

use std::sync::Arc;

use c4n_bus_relay::{Relay, RelayError, RetryPolicy};
use futures_util::TryStreamExt;
use tokio::io::AsyncBufRead;

/// Environment variable holding the Paperclip SSE endpoint URL.
const SSE_URL_ENV: &str = "C4N_PAPERCLIP_SSE_URL";
/// Environment variable holding the Paperclip bearer auth token.
const SSE_TOKEN_ENV: &str = "C4N_PAPERCLIP_TOKEN";

/// Resolved feeder configuration: where to connect and how to authenticate.
#[derive(Debug, Clone)]
pub struct FeederConfig {
    /// Paperclip SSE endpoint URL.
    pub url: String,
    /// Optional bearer token. `None` connects without an `Authorization` header.
    pub token: Option<String>,
}

impl FeederConfig {
    /// Read the feeder config from the environment. Returns `None` when no
    /// endpoint URL is configured, signalling the feeder should stay idle.
    pub fn from_env() -> Option<Self> {
        let url = std::env::var(SSE_URL_ENV).ok()?;
        let url = url.trim().to_string();
        if url.is_empty() {
            return None;
        }
        let token = std::env::var(SSE_TOKEN_ENV)
            .ok()
            .map(|t| t.trim().to_string())
            .filter(|t| !t.is_empty());
        Some(FeederConfig { url, token })
    }
}

/// Open the Paperclip SSE stream and adapt it into an [`AsyncBufRead`] for the
/// relay's pump. Translates a non-success HTTP status or a transport failure
/// into [`RelayError::Connect`] so [`Relay::run`] retries per its backoff.
async fn connect_sse(
    client: reqwest::Client,
    url: String,
    token: Option<String>,
) -> Result<impl AsyncBufRead + Unpin, RelayError> {
    let mut req = client.get(&url).header("Accept", "text/event-stream");
    if let Some(token) = token {
        req = req.bearer_auth(token);
    }

    let resp = req
        .send()
        .await
        .map_err(|e| RelayError::Connect(e.to_string()))?
        .error_for_status()
        .map_err(|e| RelayError::Connect(e.to_string()))?;

    let stream = resp.bytes_stream().map_err(std::io::Error::other);
    Ok(tokio::io::BufReader::new(
        tokio_util::io::StreamReader::new(stream),
    ))
}

/// Drive the relay's connect → pump → reconnect loop against the live
/// Paperclip stream until the process exits. Runs forever (the default
/// [`RetryPolicy`] never stops reconnecting), so this is spawned as a
/// background task.
pub async fn run_feeder(relay: Arc<Relay>, config: FeederConfig) {
    let client = match reqwest::Client::builder().build() {
        Ok(client) => client,
        Err(e) => {
            tracing::error!(error = %e, "bus-relay feeder: failed to build HTTP client");
            return;
        }
    };

    tracing::info!(url = %config.url, "bus-relay feeder: starting Paperclip SSE supervision loop");

    let connect = move || {
        let client = client.clone();
        let url = config.url.clone();
        let token = config.token.clone();
        async move { connect_sse(client, url, token).await }
    };

    match relay.run(connect, RetryPolicy::default()).await {
        Ok(stats) => {
            tracing::info!(?stats, "bus-relay feeder: supervision loop ended");
        }
        Err(e) => {
            tracing::error!(error = %e, "bus-relay feeder: supervision loop failed");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn with_env<T>(vars: &[(&str, Option<&str>)], f: impl FnOnce() -> T) -> T {
        let saved: Vec<(String, Option<String>)> = vars
            .iter()
            .map(|(k, _)| ((*k).to_string(), std::env::var(k).ok()))
            .collect();
        for (k, v) in vars {
            match v {
                Some(v) => std::env::set_var(k, v),
                None => std::env::remove_var(k),
            }
        }
        let out = f();
        for (k, v) in saved {
            match v {
                Some(v) => std::env::set_var(&k, v),
                None => std::env::remove_var(&k),
            }
        }
        out
    }

    #[test]
    fn from_env_none_without_url() {
        with_env(&[(SSE_URL_ENV, None), (SSE_TOKEN_ENV, None)], || {
            assert!(FeederConfig::from_env().is_none());
        });
    }

    #[test]
    fn from_env_blank_url_is_none() {
        with_env(&[(SSE_URL_ENV, Some("   ")), (SSE_TOKEN_ENV, None)], || {
            assert!(FeederConfig::from_env().is_none());
        });
    }

    #[test]
    fn from_env_reads_url_and_token() {
        with_env(
            &[
                (SSE_URL_ENV, Some("https://paperclip.local/events")),
                (SSE_TOKEN_ENV, Some("secret-123")),
            ],
            || {
                let cfg = FeederConfig::from_env().expect("config present");
                assert_eq!(cfg.url, "https://paperclip.local/events");
                assert_eq!(cfg.token.as_deref(), Some("secret-123"));
            },
        );
    }

    #[test]
    fn from_env_url_without_token() {
        with_env(
            &[
                (SSE_URL_ENV, Some("https://paperclip.local/events")),
                (SSE_TOKEN_ENV, None),
            ],
            || {
                let cfg = FeederConfig::from_env().expect("config present");
                assert_eq!(cfg.token, None);
            },
        );
    }

    #[test]
    fn from_env_blank_token_is_none() {
        with_env(
            &[
                (SSE_URL_ENV, Some("https://paperclip.local/events")),
                (SSE_TOKEN_ENV, Some("  ")),
            ],
            || {
                let cfg = FeederConfig::from_env().expect("config present");
                assert_eq!(cfg.token, None);
            },
        );
    }

    // End-to-end (NEVAAA-39 AC): a real HTTP `text/event-stream` event flows
    // through the live reqwest connector → StreamReader → relay pump → a bus
    // subscriber. A one-shot localhost SSE server stands in for Paperclip so the
    // whole transport path (including the `Authorization: Bearer` header) is
    // exercised against an actual socket, deterministically and without a
    // deployed backend. The desktop wiring (start_bus_feeder → setup hook) drives
    // this same connect_sse against a configured endpoint in production.
    #[tokio::test]
    async fn connect_sse_streams_a_live_http_event_through_the_relay() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        use tokio::net::TcpListener;

        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        // One-shot SSE server: read the full request header block, always reply
        // with a single agent.message frame, and hand the captured request back
        // to the test so header assertions run on the main thread (a panic in
        // the server task would otherwise just close the socket and mask the
        // real failure as a connect error).
        let server = tokio::spawn(async move {
            let (mut sock, _) = listener.accept().await.unwrap();
            let mut req = Vec::new();
            let mut tmp = [0u8; 1024];
            loop {
                let n = sock.read(&mut tmp).await.unwrap();
                if n == 0 {
                    break;
                }
                req.extend_from_slice(&tmp[..n]);
                if req.windows(4).any(|w| w == b"\r\n\r\n") {
                    break;
                }
            }

            let body = "event: agent.message\nid: 1\ndata: {\"text\":\"hi\"}\n\n";
            let resp = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            sock.write_all(resp.as_bytes()).await.unwrap();
            sock.flush().await.unwrap();
            String::from_utf8_lossy(&req).into_owned()
        });

        let relay = Relay::new();
        let mut rx = relay.subscribe();

        let client = reqwest::Client::new();
        let url = format!("http://{addr}/events");
        let mut reader = connect_sse(client, url, Some("test-token".into()))
            .await
            .expect("connector opens the live SSE stream");

        let n = relay.pump(&mut reader).await.expect("pump the live stream");
        assert_eq!(n, 1, "exactly one frame relayed");

        let env = rx
            .recv()
            .await
            .expect("subscriber receives the relayed event");
        assert_eq!(env.event_type, "agent.message");
        assert_eq!(env.from, "paperclip");
        assert_eq!(env.payload["text"], "hi");

        // hyper writes HTTP/1.1 header names lowercase, so match case-insensitively.
        let req = server.await.unwrap().to_lowercase();
        assert!(
            req.contains("authorization: bearer test-token"),
            "request must carry the bearer auth header"
        );
        assert!(
            req.contains("accept: text/event-stream"),
            "request must ask for the SSE content type"
        );
    }
}
