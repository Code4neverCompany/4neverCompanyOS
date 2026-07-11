//! Tauri v2 shell around fournever_core.
//!
//! Every command mirrors one /api/* endpoint of the Node server (server.js):
//! same argument names (camelCase over IPC), same JSON response shapes, same
//! error strings. All commands return Result<_, String> so the frontend
//! adapter can toast the error message exactly like an HTTP error body.

use std::sync::Mutex;

use serde_json::{json, Value};
use tauri::ipc::Channel;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, State, WindowEvent};

use fournever_core::model::{
    AgentInfo, IntegrationStatus, Note, Run, SearchResult, Task, TaskInput, TodayView, VaultGraph,
    VaultListItem, VaultNoteContent,
};
use fournever_core::store::Store;
use fournever_core::{agents, config, notes, tasks, util, vault};

type StoreState<'a> = State<'a, Mutex<Store>>;

fn lock<'a>(state: &'a StoreState) -> Result<std::sync::MutexGuard<'a, Store>, String> {
    state.lock().map_err(|_| "internal error: state poisoned".to_string())
}

// ---------------------------------------------------------------------------
// collection (de)serialization helpers
// ---------------------------------------------------------------------------

fn read_tasks(store: &mut Store) -> Vec<Task> {
    let v = store.read("tasks", json!([]));
    serde_json::from_value(v).unwrap_or_default()
}

fn write_tasks(store: &mut Store, list: &[Task]) {
    store.write("tasks", serde_json::to_value(list).unwrap_or(Value::Array(vec![])));
}

fn read_notes(store: &mut Store) -> Vec<Note> {
    let v = store.read("notes", json!([]));
    serde_json::from_value(v).unwrap_or_default()
}

fn write_notes(store: &mut Store, list: &[Note]) {
    store.write("notes", serde_json::to_value(list).unwrap_or(Value::Array(vec![])));
}

fn read_runs(store: &mut Store) -> Vec<Run> {
    let v = store.read("runs", json!([]));
    serde_json::from_value(v).unwrap_or_default()
}

fn write_runs(store: &mut Store, list: &[Run]) {
    store.write("runs", serde_json::to_value(list).unwrap_or(Value::Array(vec![])));
}

fn read_config(store: &mut Store) -> Value {
    store.read("config", config::default_config())
}

/// Patch one run record in the store (like updateRun in lib/agents.js).
fn update_run<F: FnOnce(&mut Run)>(store: &mut Store, id: &str, f: F) -> Option<Run> {
    let mut runs = read_runs(store);
    let run = match runs.iter_mut().find(|r| r.id == id) {
        Some(r) => {
            f(r);
            r.clone()
        }
        None => return None,
    };
    write_runs(store, &runs);
    Some(run)
}

// ---------------------------------------------------------------------------
// tasks
// ---------------------------------------------------------------------------

#[tauri::command]
fn tasks_list(
    state: StoreState,
    status: Option<String>,
    unit: Option<String>,
    priority: Option<String>,
) -> Result<Vec<Task>, String> {
    let mut store = lock(&state)?;
    let all = read_tasks(&mut store);
    Ok(tasks::filter_tasks(
        all,
        status.as_deref(),
        unit.as_deref(),
        priority.as_deref(),
    ))
}

#[tauri::command]
fn task_create(state: StoreState, input: TaskInput) -> Result<Task, String> {
    let task = tasks::create_task(&input)?;
    let mut store = lock(&state)?;
    let mut all = read_tasks(&mut store);
    all.push(task.clone());
    write_tasks(&mut store, &all);
    Ok(task)
}

#[tauri::command]
fn task_update(state: StoreState, id: String, patch: Value) -> Result<Task, String> {
    let mut store = lock(&state)?;
    let mut all = read_tasks(&mut store);
    let task = all
        .iter_mut()
        .find(|t| t.id == id)
        .ok_or_else(|| "task not found".to_string())?;
    tasks::apply_task_patch(task, &patch);
    let updated = task.clone();
    write_tasks(&mut store, &all);
    Ok(updated)
}

#[tauri::command]
fn task_delete(state: StoreState, id: String) -> Result<Value, String> {
    let mut store = lock(&state)?;
    let mut all = read_tasks(&mut store);
    let before = all.len();
    all.retain(|t| t.id != id);
    if all.len() == before {
        return Err("task not found".to_string());
    }
    write_tasks(&mut store, &all);
    Ok(json!({ "ok": true }))
}

#[tauri::command]
fn today(state: StoreState) -> Result<TodayView, String> {
    let mut store = lock(&state)?;
    let all = read_tasks(&mut store);
    Ok(tasks::today_view(&all, &util::local_date()))
}

// ---------------------------------------------------------------------------
// notes
// ---------------------------------------------------------------------------

#[tauri::command]
fn notes_list(state: StoreState) -> Result<Vec<Note>, String> {
    let mut store = lock(&state)?;
    let mut all = read_notes(&mut store);
    notes::sort_notes(&mut all);
    Ok(all)
}

#[tauri::command]
fn note_create(state: StoreState, title: String, body: Option<String>) -> Result<Note, String> {
    let note = notes::create_note(&title, body.as_deref().unwrap_or(""))?;
    let mut store = lock(&state)?;
    let mut all = read_notes(&mut store);
    all.push(note.clone());
    write_notes(&mut store, &all);
    Ok(note)
}

#[tauri::command]
fn note_update(state: StoreState, id: String, patch: Value) -> Result<Note, String> {
    let mut store = lock(&state)?;
    let mut all = read_notes(&mut store);
    let note = all
        .iter_mut()
        .find(|n| n.id == id)
        .ok_or_else(|| "note not found".to_string())?;
    notes::apply_note_patch(note, &patch);
    let updated = note.clone();
    write_notes(&mut store, &all);
    Ok(updated)
}

#[tauri::command]
fn note_delete(state: StoreState, id: String) -> Result<Value, String> {
    let mut store = lock(&state)?;
    let mut all = read_notes(&mut store);
    let before = all.len();
    all.retain(|n| n.id != id);
    if all.len() == before {
        return Err("note not found".to_string());
    }
    write_notes(&mut store, &all);
    Ok(json!({ "ok": true }))
}

// ---------------------------------------------------------------------------
// vault
// ---------------------------------------------------------------------------

#[tauri::command]
fn vault_list(state: StoreState) -> Result<Vec<VaultListItem>, String> {
    let store = lock(&state)?;
    Ok(vault::list(store.vault_dir()))
}

#[tauri::command]
fn vault_get(state: StoreState, name: String) -> Result<VaultNoteContent, String> {
    let store = lock(&state)?;
    vault::get(store.vault_dir(), &name)
}

#[tauri::command]
fn vault_put(state: StoreState, name: String, content: Option<String>) -> Result<Value, String> {
    let store = lock(&state)?;
    let written = vault::put(store.vault_dir(), &name, content.as_deref().unwrap_or(""))?;
    Ok(json!({ "ok": true, "name": written }))
}

#[tauri::command]
fn vault_delete(state: StoreState, name: String) -> Result<Value, String> {
    let store = lock(&state)?;
    vault::delete(store.vault_dir(), &name)?;
    Ok(json!({ "ok": true }))
}

#[tauri::command]
fn vault_graph(state: StoreState) -> Result<VaultGraph, String> {
    let store = lock(&state)?;
    Ok(vault::graph(store.vault_dir()))
}

#[tauri::command]
fn vault_search(state: StoreState, q: Option<String>) -> Result<Vec<SearchResult>, String> {
    let store = lock(&state)?;
    Ok(vault::search(store.vault_dir(), q.as_deref().unwrap_or("")))
}

// ---------------------------------------------------------------------------
// agents & runs
// ---------------------------------------------------------------------------

#[tauri::command]
fn agents_list(state: StoreState) -> Result<Vec<AgentInfo>, String> {
    let cfg = {
        let mut store = lock(&state)?;
        read_config(&mut store)
    };
    // availability probing spawns `where`/`which`; done outside the lock
    Ok(agents::list_agents(&cfg))
}

/// POST /api/agents/run equivalent. Returns the Run record immediately
/// (status "running") and finishes in a background thread, streaming
/// {"event":"chunk",...} messages and a final {"event":"done","run":...}
/// through the provided channel.
#[tauri::command]
fn agent_run(
    app: AppHandle,
    state: StoreState,
    agent_id: String,
    prompt: String,
    on_event: Channel<Value>,
) -> Result<Run, String> {
    if agent_id.is_empty() {
        return Err("agentId is required".to_string());
    }
    let prompt = prompt.trim().to_string();
    if prompt.is_empty() {
        return Err("prompt is required".to_string());
    }

    let agent = {
        let mut store = lock(&state)?;
        let cfg = read_config(&mut store);
        agents::merge_agents(&cfg)
            .into_iter()
            .find(|a| a.id == agent_id)
            .ok_or_else(|| format!("unknown agent: {}", agent_id))?
    };

    let run = agents::new_run(&agent_id, &prompt, vec![]);
    {
        let mut store = lock(&state)?;
        let mut runs = read_runs(&mut store);
        agents::push_run(&mut runs, run.clone());
        write_runs(&mut store, &runs);
    }

    let run_id = run.id.clone();
    std::thread::spawn(move || {
        let outcome = agents::execute(&agent, &prompt, |chunk| {
            let _ = on_event.send(json!({
                "event": "chunk",
                "runId": run_id,
                "chunk": chunk
            }));
        });
        let finished = {
            let state = app.state::<Mutex<Store>>();
            let mut store = match state.lock() {
                Ok(g) => g,
                Err(p) => p.into_inner(),
            };
            update_run(&mut store, &run_id, |r| {
                r.status = outcome.status.clone();
                r.exit_code = outcome.exit_code;
                r.output = outcome.output.clone();
                r.finished_at = Some(util::now_iso());
            })
        };
        if let Some(r) = finished {
            let _ = on_event.send(json!({
                "event": "done",
                "run": serde_json::to_value(&r).unwrap_or(Value::Null)
            }));
        }
    });

    Ok(run)
}

#[tauri::command]
fn runs_list(state: StoreState) -> Result<Vec<Run>, String> {
    let mut store = lock(&state)?;
    let mut runs = read_runs(&mut store);
    runs.sort_by(|a, b| b.started_at.cmp(&a.started_at));
    runs.truncate(50);
    Ok(runs)
}

#[tauri::command]
fn run_get(state: StoreState, id: String) -> Result<Run, String> {
    let mut store = lock(&state)?;
    read_runs(&mut store)
        .into_iter()
        .find(|r| r.id == id)
        .ok_or_else(|| "run not found".to_string())
}

/// POST /api/agents/delegate equivalent. All Run records are created up
/// front (so every run id returns immediately); the chain executes
/// sequentially in a background thread. A failed stage marks the remaining
/// stages as error, exactly like lib/agents.js.
#[tauri::command]
fn agents_delegate(
    app: AppHandle,
    state: StoreState,
    prompt: String,
    chain: Option<Vec<Value>>,
) -> Result<Value, String> {
    let prompt = prompt.trim().to_string();
    let chain: Vec<String> = chain
        .unwrap_or_default()
        .iter()
        .map(util::js_string)
        .collect();
    if prompt.is_empty() {
        return Err("prompt is required".to_string());
    }
    if chain.is_empty() {
        return Err("chain must contain at least one agentId".to_string());
    }

    let (stage_agents, runs) = {
        let mut store = lock(&state)?;
        let cfg = read_config(&mut store);
        let all = agents::merge_agents(&cfg);
        let missing: Vec<&String> = chain
            .iter()
            .filter(|id| !all.iter().any(|a| a.id == **id))
            .collect();
        if !missing.is_empty() {
            let names: Vec<String> = missing.iter().map(|s| s.to_string()).collect();
            return Err(format!("unknown agent(s): {}", names.join(", ")));
        }
        let stage_agents: Vec<_> = chain
            .iter()
            .map(|id| all.iter().find(|a| a.id == *id).unwrap().clone())
            .collect();
        let mut runs_store = read_runs(&mut store);
        let mut created = Vec::new();
        for id in &chain {
            let r = agents::new_run(id, &prompt, chain.clone());
            agents::push_run(&mut runs_store, r.clone());
            created.push(r);
        }
        write_runs(&mut store, &runs_store);
        (stage_agents, created)
    };

    let run_ids: Vec<String> = runs.iter().map(|r| r.id.clone()).collect();
    let result = json!({ "id": util::gen_id(), "runs": run_ids });

    let thread_ids: Vec<String> = runs.iter().map(|r| r.id.clone()).collect();
    std::thread::spawn(move || {
        let mut context: Option<String> = None;
        for (i, agent) in stage_agents.iter().enumerate() {
            let stage_prompt = agents::build_stage_prompt(context.as_deref(), &prompt);
            {
                let state = app.state::<Mutex<Store>>();
                let mut store = match state.lock() {
                    Ok(g) => g,
                    Err(p) => p.into_inner(),
                };
                update_run(&mut store, &thread_ids[i], |r| {
                    r.prompt = stage_prompt.clone();
                    r.started_at = util::now_iso();
                });
            }
            let outcome = agents::execute(agent, &stage_prompt, |_| {});
            let done = {
                let state = app.state::<Mutex<Store>>();
                let mut store = match state.lock() {
                    Ok(g) => g,
                    Err(p) => p.into_inner(),
                };
                update_run(&mut store, &thread_ids[i], |r| {
                    r.status = outcome.status.clone();
                    r.exit_code = outcome.exit_code;
                    r.output = outcome.output.clone();
                    r.finished_at = Some(util::now_iso());
                })
            };
            let ok = done.map(|r| r.status == "done").unwrap_or(false);
            if !ok {
                let state = app.state::<Mutex<Store>>();
                let mut store = match state.lock() {
                    Ok(g) => g,
                    Err(p) => p.into_inner(),
                };
                for rid in thread_ids.iter().skip(i + 1) {
                    update_run(&mut store, rid, |r| {
                        r.status = "error".to_string();
                        r.output = "Skipped: a previous agent in the chain failed.".to_string();
                        r.finished_at = Some(util::now_iso());
                    });
                }
                return;
            }
            context = Some(outcome.output.clone());
        }
    });

    Ok(result)
}

// ---------------------------------------------------------------------------
// config & integrations
// ---------------------------------------------------------------------------

#[tauri::command]
fn config_get(state: StoreState) -> Result<Value, String> {
    let mut store = lock(&state)?;
    let cfg = read_config(&mut store);
    Ok(config::mask_config(&cfg))
}

#[tauri::command]
fn config_set(state: StoreState, patch: Value) -> Result<Value, String> {
    let mut store = lock(&state)?;
    let current = read_config(&mut store);
    let patch = if patch.is_object() { patch } else { json!({}) };
    let merged = config::deep_merge(&config::deep_merge(&config::default_config(), &current), &patch);
    store.write("config", merged.clone());
    Ok(config::mask_config(&merged))
}

#[tauri::command]
fn integrations_status(state: StoreState) -> Result<Vec<IntegrationStatus>, String> {
    let mut store = lock(&state)?;
    let cfg = read_config(&mut store);
    Ok(config::integrations_status(&cfg))
}

#[tauri::command]
fn data_root(state: StoreState) -> Result<String, String> {
    let store = lock(&state)?;
    Ok(store.root().to_string_lossy().to_string())
}

// ---------------------------------------------------------------------------
// window / tray plumbing
// ---------------------------------------------------------------------------

fn show_main_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    let mut builder = TrayIconBuilder::with_id("main-tray")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("4neverCompanyOS")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// entry point
// ---------------------------------------------------------------------------

pub fn run() {
    // Store + seeded collections + orphaned-run reconciliation (server.js boot).
    let root = fournever_core::store::resolve_data_root();
    let mut store = Store::new(root);
    store.seed_defaults();
    {
        let mut runs = read_runs(&mut store);
        if agents::reconcile_orphans(&mut runs) {
            write_runs(&mut store, &runs);
        }
    }

    tauri::Builder::default()
        .manage(Mutex::new(store))
        .setup(|app| {
            setup_tray(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            // Close button hides to tray; real exit happens via tray "Quit".
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    let _ = window.hide();
                    api.prevent_close();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            tasks_list,
            task_create,
            task_update,
            task_delete,
            today,
            notes_list,
            note_create,
            note_update,
            note_delete,
            vault_list,
            vault_get,
            vault_put,
            vault_delete,
            vault_graph,
            vault_search,
            agents_list,
            agent_run,
            runs_list,
            run_get,
            agents_delegate,
            config_get,
            config_set,
            integrations_status,
            data_root
        ])
        .run(tauri::generate_context!())
        .expect("error while running 4neverCompanyOS");
}
