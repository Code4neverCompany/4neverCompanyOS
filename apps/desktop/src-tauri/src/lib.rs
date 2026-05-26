//! 4neverCompany OS — desktop shell (Rust / Tauri sidecar).
//!
//! Architecture D-1: synchronous front-end → Rust calls go through
//! Tauri `invoke()` commands (in `commands::`); long-lived streams
//! (bus messages, persona stdout/stderr, file-watch events) use a
//! sidecar IPC channel (in `ipc::`).

mod commands;
mod ipc;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![commands::ping])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
