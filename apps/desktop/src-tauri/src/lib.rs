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
        // Story 5.7 (FR-35): project-level kill switch. Tracks active
        // dynamic persona sessions so kill_all_project_personas can terminate
        // all personas for a project in one call.
        .manage(commands::DynamicPersonaRegistry::default())
        // Story 5.6: per-persona token budget tracking.
        .manage(commands::BudgetStore::default())
        // Story 4.1 (Epic 4): BMAD workflow entry point. Tracks the active
        // workflow run in-memory; vault dir + persistence land in Story 4-4.
        .manage(commands::WorkflowRunStore::load_or_default())
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
            // Story 4.2 (NEVAAA-51): BMAD workflow engine — phase execution.
            // Called by the TypeScript WorkflowEngine; advance_workflow_phase
            // updates phase state, check_vault_artifact_exists polls for completion,
            // log_workflow_decision records approvals to vault, dismiss clears state.
            commands::advance_workflow_phase,
            commands::check_vault_artifact_exists,
            commands::read_vault_artifact,
            commands::log_workflow_decision,
            commands::dismiss_workflow_run,
            // Story 4.5 (NEVAAA-55): story-state watcher — emits
            // "story-state-changed" Tauri events consumed by the
            // ProgressBus bridge in main.tsx to feed the stall detector.
            commands::start_story_state_watcher,
            // Story 5.2 (FR-31): Supermemory opt-in settings.
            commands::get_supermemory_categories,
            commands::save_supermemory_categories,
            // Story 5.4 (FR-33): GitHub sync push/pull/init/status.
            commands::github_sync_status,
            commands::github_sync_push,
            commands::github_sync_pull,
            commands::github_sync_init,
            // Story 5.7 (FR-35): project-level kill switch.
            commands::kill_all_project_personas,
            // Story 5.6: per-persona token budget management.
            commands::get_persona_budgets,
            commands::get_persona_budget_limits,
            commands::add_persona_spend,
            commands::save_persona_budgets,
            commands::reset_persona_spend,
            commands::unpause_persona_budget,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
