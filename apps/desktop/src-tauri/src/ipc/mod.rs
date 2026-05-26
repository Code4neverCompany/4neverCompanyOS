//! Streaming IPC channel (D-1).
//!
//! Bus messages, persona stdout/stderr, and file-watch events flow
//! through this module rather than through Tauri commands so that
//! the front-end can subscribe to long-lived streams cleanly.
//!
//! Implementation lands in M2 (bus relay, D-3) and is extended in
//! M3 (persona supervisor capture, D-11) and M4 (workflow events).

// placeholder for now — M2 stories add the IPC handlers.
