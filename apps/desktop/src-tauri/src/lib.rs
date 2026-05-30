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
//! Story 3.7 adds `PendingProposalsStore` + receive/list/dismiss commands
//! for Hermes-initiated spawn proposals.
//! Story 4.1 adds `WorkflowRunStore` + list/start/get/pause workflow commands.

mod commands;
mod ipc;

use tauri::Manager;

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
        // Story 3.4: per-persona drift watchers (FR-21). One registry for
        // the whole app; watchers started at spawn_dynamic_persona.
        .manage(commands::DriftRegistry::default())
        // Story 3.7 (NEVAAA-33): pending spawn proposals from Hermes.
        // Shared store read by the approval UI (Story 3.8 / NEVAAA-34).
        .manage(commands::PendingProposalsStore::default())
        // Story 4.1 (Epic 4): BMAD workflow entry point. Tracks the active
        // workflow run in-memory; vault dir + SQLite persistence land in Story 4-4.
        .manage(commands::WorkflowRunStore::default())
        // Story 2.9 (NEVAAA-29): bus relay → UI bridge. One BusRelayState
        // (the IPC fan-out hub + per-subscription handles) for the whole app
        // so every `bus_subscribe` shares the same upstream event stream.
        .manage(ipc::BusRelayState::default())
        // NEVAAA-39: start the live Paperclip SSE feeder against that same
        // relay. Reads endpoint + token from the environment; idle no-op when
        // unconfigured so the desktop runs without a live Paperclip backend.
        .setup(|app| {
            ipc::start_bus_feeder(app.state::<ipc::BusRelayState>().inner());
            Ok(())
        })
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
            // Story 2.3: Frontend Designer (Antigravity CLI) spawn / status / kill.
            // Same shape as Dev and Hermes; PersonasView (App.tsx "personas" rail)
            // uses these to manage the designer persona lifecycle.
            commands::spawn_designer_persona,
            commands::designer_persona_status,
            commands::kill_designer_persona,
            commands::project_agy_md,
            // Story 2.3 (vault bridge): read vault context summary and write notes
            // back to the Obsidian vault from the Personas panel.
            commands::vault_context_summary,
            commands::write_vault_note,
            // Story 1.16c: tap-file tail streaming for the embedded
            // xterm.js views (Dev terminal in ProjectsView, Hermes
            // terminal in MemoryView).
            commands::tail_persona_pty,
            commands::stop_persona_pty_tail,
            // Story 1.16d: keystroke path — xterm.js onData writes
            // bytes into the supervisor's `.pty.in` file via this
            // command; the supervisor drains them into the child's stdin.
            commands::write_persona_pty_in,
            // Story 3.1 (BMad Builder): dynamic persona spawn/kill.
            // The Add Agent panel uses these to create ephemeral or
            // persistent personas beyond the two fixed ones.
            commands::spawn_dynamic_persona,
            commands::kill_dynamic_persona,
            // Story 3.5 (vault scoping): read the best-effort out-of-scope
            // write log so the Personas panel can surface a violation badge.
            commands::persona_scope_violations,
            // Story 3.4 (FR-21 drift detection): poll drift state and dismiss
            // the badge for dynamic persistent personas.
            commands::get_persona_drift_state,
            commands::dismiss_persona_drift,
            // Story 3.10 (persona authoring): author a custom persona,
            // list all authored personas, and list installable BMad skills.
            commands::author_persona,
            commands::list_authored_personas,
            commands::list_installed_skills,
            // Story 3.7 (NEVAAA-33): Hermes-initiated spawn proposals.
            // receive validates and stores; list/dismiss used by the
            // approval UI (Story 3.8 / NEVAAA-34).
            commands::receive_spawn_proposal,
            commands::list_pending_proposals,
            commands::dismiss_spawn_proposal,
            // Story 2.9 (NEVAAA-29): bus relay → UI bridge. bus_subscribe
            // streams canonical envelopes into a Tauri Channel; bus_unsubscribe
            // tears a subscription down by id. Consumed by the Story 2.10
            // channel-view panel.
            ipc::bus_subscribe,
            ipc::bus_unsubscribe,
            ipc::bus_publish,
            // Story 2.11 (NEVAAA-31): relay connection-state stream. The panel
            // status bar subscribes to show "reconnecting…" + attempt count
            // while the Paperclip stream is down, then resumes the live feed.
            ipc::bus_connection_subscribe,
            ipc::bus_connection_unsubscribe,
            // Story 4.1: BMAD workflow engine — entry point.
            commands::list_workflows,
            commands::start_workflow_run,
            commands::get_workflow_run,
            commands::pause_workflow_run,
            commands::resume_workflow_run,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
