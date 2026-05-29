//! Server-Sent Events (SSE) frame parsing.
//!
//! Paperclip exposes its event system as an SSE stream. This module parses the
//! line-oriented SSE wire format (per the WHATWG `text/event-stream` spec) off
//! any [`AsyncBufRead`] source — a real TCP/TLS stream in production, an
//! in-memory buffer in tests. Keeping the parser generic over the reader is
//! what makes `connect / receive / disconnect / reconnect` unit-testable
//! without standing up a live HTTP server.
//!
//! A frame is dispatched on a blank line. Recognized fields:
//!   - `event:` — the event type.
//!   - `id:`    — the upstream event id.
//!   - `data:`  — the body; multiple `data:` lines are joined with `\n`.
//!   - `retry:` — reconnection hint in milliseconds.
//!
//! Lines beginning with `:` are comments and are ignored. A field with no
//! colon is treated as the field name with an empty value, per spec.

use tokio::io::{AsyncBufRead, AsyncBufReadExt};

use crate::RelayError;

/// One parsed SSE event.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct SseFrame {
    /// `event:` field — the event type. `None` means the SSE default.
    pub event: Option<String>,
    /// `id:` field — the upstream event id.
    pub id: Option<String>,
    /// Concatenated `data:` field(s).
    pub data: String,
    /// `retry:` field — reconnection delay hint in milliseconds.
    pub retry: Option<u64>,
}

/// Read the next complete SSE frame from `reader`.
///
/// Returns `Ok(Some(frame))` for each dispatched event, and `Ok(None)` at
/// clean end-of-stream (the source disconnected). A frame buffered at EOF with
/// no trailing blank line is still dispatched, matching lenient SSE clients.
pub async fn next_frame<R: AsyncBufRead + Unpin>(
    reader: &mut R,
) -> Result<Option<SseFrame>, RelayError> {
    let mut frame = SseFrame::default();
    let mut data_lines: Vec<String> = Vec::new();
    let mut saw_field = false;
    let mut line = String::new();

    loop {
        line.clear();
        let n = reader
            .read_line(&mut line)
            .await
            .map_err(|e| RelayError::Io(e.to_string()))?;

        if n == 0 {
            // End of stream. Flush any partially-accumulated frame.
            if saw_field {
                frame.data = data_lines.join("\n");
                return Ok(Some(frame));
            }
            return Ok(None);
        }

        let content = line.trim_end_matches(|c| c == '\n' || c == '\r');

        if content.is_empty() {
            // Blank line dispatches the current frame, if any.
            if saw_field {
                frame.data = data_lines.join("\n");
                return Ok(Some(frame));
            }
            continue;
        }

        // Comment line.
        if content.starts_with(':') {
            continue;
        }

        saw_field = true;
        let (field, value) = match content.split_once(':') {
            Some((f, v)) => (f, v.strip_prefix(' ').unwrap_or(v)),
            None => (content, ""),
        };

        match field {
            "event" => frame.event = Some(value.to_string()),
            "id" => frame.id = Some(value.to_string()),
            "data" => data_lines.push(value.to_string()),
            "retry" => frame.retry = value.parse().ok(),
            _ => {} // unknown field — ignore per spec
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::BufReader;

    fn reader(s: &'static str) -> BufReader<&'static [u8]> {
        BufReader::new(s.as_bytes())
    }

    #[tokio::test]
    async fn parses_single_frame() {
        let mut r = reader("event: agent.message\nid: 7\ndata: {\"x\":1}\n\n");
        let frame = next_frame(&mut r).await.unwrap().unwrap();
        assert_eq!(frame.event.as_deref(), Some("agent.message"));
        assert_eq!(frame.id.as_deref(), Some("7"));
        assert_eq!(frame.data, "{\"x\":1}");
    }

    #[tokio::test]
    async fn joins_multiple_data_lines() {
        let mut r = reader("data: line1\ndata: line2\n\n");
        let frame = next_frame(&mut r).await.unwrap().unwrap();
        assert_eq!(frame.data, "line1\nline2");
    }

    #[tokio::test]
    async fn ignores_comments_and_handles_crlf() {
        let mut r = reader(": keep-alive\r\nevent: ping\r\ndata: hi\r\n\r\n");
        let frame = next_frame(&mut r).await.unwrap().unwrap();
        assert_eq!(frame.event.as_deref(), Some("ping"));
        assert_eq!(frame.data, "hi");
    }

    #[tokio::test]
    async fn reads_consecutive_frames_then_eof() {
        let mut r = reader("data: a\n\ndata: b\n\n");
        assert_eq!(next_frame(&mut r).await.unwrap().unwrap().data, "a");
        assert_eq!(next_frame(&mut r).await.unwrap().unwrap().data, "b");
        // Clean disconnect.
        assert_eq!(next_frame(&mut r).await.unwrap(), None);
    }

    #[tokio::test]
    async fn flushes_frame_without_trailing_blank_line() {
        let mut r = reader("event: x\ndata: y");
        let frame = next_frame(&mut r).await.unwrap().unwrap();
        assert_eq!(frame.event.as_deref(), Some("x"));
        assert_eq!(frame.data, "y");
    }

    #[tokio::test]
    async fn empty_stream_is_immediate_eof() {
        let mut r = reader("");
        assert_eq!(next_frame(&mut r).await.unwrap(), None);
    }
}
