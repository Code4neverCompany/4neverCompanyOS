//! Tauri synchronous-call surface (D-1).
//!
//! Each function annotated with `#[tauri::command]` becomes invokable
//! from the front-end via `invoke('name', args)`. Long-lived streams
//! live in `crate::ipc` instead.

#[tauri::command]
pub fn ping() -> &'static str {
    "pong"
}
