//! 4neverCompany OS — desktop shell (Rust / Tauri sidecar).
//!
//! Architecture D-1: synchronous front-end → Rust calls go through
//! Tauri `invoke()` commands (in `commands::`); long-lived streams
//! (bus messages, persona stdout/stderr, file-watch events) use a
//! sidecar IPC channel (in `ipc::`).
//!
//! Story 1.12 adds the project-open + Dev persona spawn pipeline.
//! Story 1.13 adds claude.md projection from the bundled Dev persona.
//! Story 1.16b adds Hermes spawn alongside Dev (second Zellij session).
//! Story 1.16c adds the `tail_persona_pty` Channel command + the
//! `PtyTailRegistry` shared state so the embedded xterm.js views can
//! stream the supervisor's PTY tap file.

mod commands;
mod ipc;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        // Story 1.12: the Projects view uses the dialog plugin to pick a
        // project directory from the frontend (`@tauri-apps/plugin-dialog`).
        .plugin(tauri_plugin_dialog::init())
        // Story 1.16c: shared per-persona stop flags for `tail_persona_pty`.
        // One registry for the whole app; `tail_persona_pty` dedupes
        // per persona_id so React's StrictMode double-mounts don't leak
        // tasks.
        .manage(commands::PtyTailRegistry::default())
        .invoke_handler(tauri::generate_handler![
            commands::ping,
            commands::open_project,
            commands::current_project,
            commands::close_active_project,
            commands::spawn_dev_persona,
            commands::dev_persona_status,
            commands::zellij_available,
            // Story 1.13: claude.md projection (called automatically by
            // spawn_dev_persona; exposed separately for "re-project
            // without spawning" flows in M2+).
            commands::project_claude_md,
            // Story 1.16b: Hermes spawn / status / kill. Same shape as
            // the Dev persona commands so the frontend (Story 1.16c)
            // can render both via shared components.
            commands::spawn_hermes,
            commands::hermes_status,
            commands::kill_hermes,
            // Story 1.16c: tap-file tail streaming for the embedded
            // xterm.js views (Dev terminal in ProjectsView, Hermes
            // terminal in MemoryView).
            commands::tail_persona_pty,
            commands::stop_persona_pty_tail,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
