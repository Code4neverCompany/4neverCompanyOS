//! Agent registry + CLI run execution — ports lib/agents.js.

use std::io::Read;
use std::process::{Command, Stdio};
use std::sync::mpsc::{self, RecvTimeoutError};
use std::time::{Duration, Instant};

use serde_json::Value;

use crate::model::{AgentDef, AgentInfo, Run};
use crate::util::{floor_char_boundary, gen_id, js_string, js_truthy, now_iso};

pub const OUTPUT_CAP: usize = 100 * 1024; // 100KB
pub const RUN_TIMEOUT_MS: u64 = 120 * 1000; // 120s
pub const RUNS_MAX: usize = 50;

pub fn default_agents() -> Vec<AgentDef> {
    vec![
        AgentDef {
            id: "claude".into(),
            name: "Claude".into(),
            cmd: "claude".into(),
            args: vec!["-p".into()],
            description: "Anthropic Claude Code CLI (prompt passed via -p).".into(),
        },
        AgentDef {
            id: "pi".into(),
            name: "Pi".into(),
            cmd: "pi".into(),
            args: vec![],
            description: "Pi CLI agent (prompt passed as last argument).".into(),
        },
        AgentDef {
            id: "antigravity".into(),
            name: "Antigravity".into(),
            cmd: "antigravity".into(),
            args: vec![],
            description: "Antigravity CLI agent (prompt passed as last argument).".into(),
        },
    ]
}

/// Defaults merged with `config.customAgents` (same-id entries override
/// defaults, new ids are appended). Pure — no availability probing.
pub fn merge_agents(config: &Value) -> Vec<AgentDef> {
    let mut merged = default_agents();
    let custom = config
        .get("customAgents")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    for c in &custom {
        let id_ok = c.get("id").map(js_truthy).unwrap_or(false);
        let cmd_ok = c.get("cmd").map(js_truthy).unwrap_or(false);
        if !c.is_object() || !id_ok || !cmd_ok {
            continue;
        }
        let id = js_string(c.get("id").unwrap());
        let agent = AgentDef {
            id: id.clone(),
            name: match c.get("name") {
                Some(n) if js_truthy(n) => js_string(n),
                _ => id.clone(),
            },
            cmd: js_string(c.get("cmd").unwrap()),
            args: c
                .get("args")
                .and_then(|a| a.as_array())
                .map(|a| a.iter().map(js_string).collect())
                .unwrap_or_default(),
            description: match c.get("description") {
                Some(d) if js_truthy(d) => js_string(d),
                _ => "Custom agent from config.".to_string(),
            },
        };
        if let Some(idx) = merged.iter().position(|a| a.id == agent.id) {
            merged[idx] = agent;
        } else {
            merged.push(agent);
        }
    }
    merged
}

/// Probe availability via `where` (Windows) / `which` (elsewhere).
pub fn is_available(cmd: &str) -> bool {
    let probe = if cfg!(windows) { "where" } else { "which" };
    let mut c = Command::new(probe);
    c.arg(cmd)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x0800_0000); // CREATE_NO_WINDOW (no console flash in GUI app)
    }
    c.status().map(|s| s.success()).unwrap_or(false)
}

/// Registry with live availability flags (GET /api/agents shape).
pub fn list_agents(config: &Value) -> Vec<AgentInfo> {
    merge_agents(config)
        .into_iter()
        .map(|a| {
            let available = is_available(&a.cmd);
            AgentInfo {
                id: a.id,
                name: a.name,
                cmd: a.cmd,
                args: a.args,
                description: a.description,
                available,
            }
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Run records
// ---------------------------------------------------------------------------

pub fn new_run(agent_id: &str, prompt: &str, delegated_to: Vec<String>) -> Run {
    Run {
        id: gen_id(),
        agent_id: agent_id.to_string(),
        prompt: prompt.to_string(),
        status: "running".to_string(),
        output: String::new(),
        exit_code: None,
        started_at: now_iso(),
        finished_at: None,
        delegated_to,
    }
}

/// Unshift + cap at RUNS_MAX (newest first).
pub fn push_run(runs: &mut Vec<Run>, run: Run) {
    runs.insert(0, run);
    runs.truncate(RUNS_MAX);
}

/// Boot reconciliation: any run still "running" when the app starts was
/// orphaned by a previous process — mark it as error. Returns whether
/// anything changed (caller persists).
pub fn reconcile_orphans(runs: &mut [Run]) -> bool {
    let mut changed = false;
    let now = now_iso();
    for r in runs.iter_mut() {
        if r.status == "running" {
            r.status = "error".to_string();
            if r.output.is_empty() {
                r.output = "(orphaned by restart)".to_string();
            } else {
                r.output.push_str("\n(orphaned by restart)");
            }
            r.finished_at = Some(now.clone());
            changed = true;
        }
    }
    changed
}

/// Stage prompt for the delegate pipeline.
pub fn build_stage_prompt(context: Option<&str>, prompt: &str) -> String {
    match context {
        None => prompt.to_string(),
        Some(c) => format!("Context from previous agent:\n{}\n\nTask: {}", c, prompt),
    }
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct ExecOutcome {
    pub status: String, // "done" | "error"
    pub exit_code: Option<i64>,
    pub output: String,
}

/// cmd.exe-safe quoting (mirrors quoteArgWin in lib/agents.js).
pub fn quote_arg_win(a: &str) -> String {
    if a.is_empty() {
        return "\"\"".to_string();
    }
    let needs = a
        .chars()
        .any(|c| c.is_whitespace() || matches!(c, '"' | '&' | '|' | '<' | '>' | '^' | '%'));
    if !needs {
        return a.to_string();
    }
    format!("\"{}\"", a.replace('"', "\"\""))
}

#[cfg(windows)]
fn build_command(agent: &AgentDef, prompt: &str) -> Command {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    // Node spawn(..., { shell: true }) on win32 runs: cmd.exe /d /s /c "<line>"
    let mut parts: Vec<String> = vec![agent.cmd.clone()];
    for a in &agent.args {
        parts.push(quote_arg_win(a));
    }
    parts.push(quote_arg_win(prompt));
    let line = parts.join(" ");
    let comspec = std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string());
    let mut cmd = Command::new(comspec);
    cmd.raw_arg("/d")
        .raw_arg("/s")
        .raw_arg("/c")
        .raw_arg(format!("\"{}\"", line));
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
}

#[cfg(not(windows))]
fn build_command(agent: &AgentDef, prompt: &str) -> Command {
    let mut cmd = Command::new(&agent.cmd);
    cmd.args(&agent.args).arg(prompt);
    cmd
}

fn spawn_reader<R: Read + Send + 'static>(mut r: R, tx: mpsc::Sender<Vec<u8>>) {
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match r.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    if tx.send(buf[..n].to_vec()).is_err() {
                        break;
                    }
                }
            }
        }
    });
}

fn cap_output(mut output: String) -> String {
    if output.len() > OUTPUT_CAP {
        let cut = floor_char_boundary(&output, OUTPUT_CAP);
        output.truncate(cut);
    }
    output
}

/// Execute an agent CLI with the default 120s timeout, streaming captured
/// output chunks to `on_chunk`. Never panics; always returns an outcome.
pub fn execute<F: FnMut(&str)>(agent: &AgentDef, prompt: &str, on_chunk: F) -> ExecOutcome {
    execute_with_timeout(agent, prompt, RUN_TIMEOUT_MS, on_chunk)
}

pub fn execute_with_timeout<F: FnMut(&str)>(
    agent: &AgentDef,
    prompt: &str,
    timeout_ms: u64,
    mut on_chunk: F,
) -> ExecOutcome {
    let mut output = String::new();

    let mut cmd = build_command(agent, prompt);
    cmd.stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            return ExecOutcome {
                status: "error".to_string(),
                exit_code: None,
                output: format!("spawn error: {}", e),
            }
        }
    };

    let (tx, rx) = mpsc::channel::<Vec<u8>>();
    if let Some(out) = child.stdout.take() {
        spawn_reader(out, tx.clone());
    }
    if let Some(err) = child.stderr.take() {
        spawn_reader(err, tx.clone());
    }
    drop(tx);

    let deadline = Instant::now() + Duration::from_millis(timeout_ms);
    let mut streams_open = true;

    loop {
        if streams_open {
            match rx.recv_timeout(Duration::from_millis(50)) {
                Ok(chunk) => {
                    // Mirror Node: only append while below the cap.
                    if output.len() < OUTPUT_CAP {
                        let s = String::from_utf8_lossy(&chunk).into_owned();
                        output.push_str(&s);
                        on_chunk(&s);
                    }
                }
                Err(RecvTimeoutError::Timeout) => {}
                Err(RecvTimeoutError::Disconnected) => streams_open = false,
            }
        } else {
            // Streams are done; wait for process exit.
            match child.try_wait() {
                Ok(Some(status)) => {
                    let exit_code = status.code().map(|c| c as i64);
                    let st = if exit_code == Some(0) { "done" } else { "error" };
                    return ExecOutcome {
                        status: st.to_string(),
                        exit_code,
                        output: cap_output(output),
                    };
                }
                Ok(None) => std::thread::sleep(Duration::from_millis(25)),
                Err(_) => std::thread::sleep(Duration::from_millis(25)),
            }
        }

        if Instant::now() >= deadline {
            output.push_str("\n[killed after 120s timeout]");
            let _ = child.kill();
            let _ = child.wait();
            return ExecOutcome {
                status: "error".to_string(),
                exit_code: None,
                output: cap_output(output),
            };
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn default_registry() {
        let a = default_agents();
        assert_eq!(a.len(), 3);
        assert_eq!(a[0].id, "claude");
        assert_eq!(a[0].args, vec!["-p"]);
        assert_eq!(a[1].id, "pi");
        assert_eq!(a[2].id, "antigravity");
    }

    #[test]
    fn merge_custom_agents_override_and_append() {
        let config = json!({
            "customAgents": [
                { "id": "claude", "cmd": "claude-custom", "args": ["--yolo"] },
                { "id": "mybot", "name": "My Bot", "cmd": "mybot", "description": "d" },
                { "id": "", "cmd": "x" },          // skipped: falsy id
                { "id": "nocmd" },                  // skipped: no cmd
                null                                 // skipped
            ]
        });
        let merged = merge_agents(&config);
        assert_eq!(merged.len(), 4);
        let claude = merged.iter().find(|a| a.id == "claude").unwrap();
        assert_eq!(claude.cmd, "claude-custom");
        assert_eq!(claude.args, vec!["--yolo"]);
        assert_eq!(claude.name, "claude"); // name falls back to id
        assert_eq!(claude.description, "Custom agent from config.");
        let mybot = merged.iter().find(|a| a.id == "mybot").unwrap();
        assert_eq!(mybot.name, "My Bot");
        assert_eq!(mybot.description, "d");
        // defaults untouched when no customAgents
        assert_eq!(merge_agents(&json!({})).len(), 3);
    }

    #[test]
    fn stage_prompt_construction() {
        assert_eq!(build_stage_prompt(None, "do it"), "do it");
        assert_eq!(
            build_stage_prompt(Some("previous output"), "do it"),
            "Context from previous agent:\nprevious output\n\nTask: do it"
        );
        // empty context is still Some -> wrapped (Node checks context === null)
        assert_eq!(
            build_stage_prompt(Some(""), "t"),
            "Context from previous agent:\n\n\nTask: t"
        );
    }

    #[test]
    fn run_cap_50_newest_first() {
        let mut runs: Vec<Run> = Vec::new();
        for i in 0..60 {
            push_run(&mut runs, new_run(&format!("agent{}", i), "p", vec![]));
        }
        assert_eq!(runs.len(), RUNS_MAX);
        assert_eq!(runs[0].agent_id, "agent59"); // newest first
        assert_eq!(runs[49].agent_id, "agent10"); // oldest 10 dropped
    }

    #[test]
    fn reconcile_orphans_marks_error() {
        let mut runs = vec![
            {
                let mut r = new_run("a", "p", vec![]);
                r.output = "partial".into();
                r
            },
            {
                let mut r = new_run("b", "p", vec![]);
                r.status = "done".into();
                r.output = "ok".into();
                r
            },
            new_run("c", "p", vec![]),
        ];
        assert!(reconcile_orphans(&mut runs));
        assert_eq!(runs[0].status, "error");
        assert_eq!(runs[0].output, "partial\n(orphaned by restart)");
        assert!(runs[0].finished_at.is_some());
        assert_eq!(runs[1].status, "done");
        assert_eq!(runs[1].output, "ok");
        assert_eq!(runs[2].status, "error");
        assert_eq!(runs[2].output, "(orphaned by restart)");
        // second pass: nothing left to fix
        assert!(!reconcile_orphans(&mut runs));
    }

    #[test]
    fn quote_win() {
        assert_eq!(quote_arg_win(""), "\"\"");
        assert_eq!(quote_arg_win("plain"), "plain");
        assert_eq!(quote_arg_win("has space"), "\"has space\"");
        assert_eq!(quote_arg_win("a\"b"), "\"a\"\"b\"");
        assert_eq!(quote_arg_win("pipe|me"), "\"pipe|me\"");
        assert_eq!(quote_arg_win("100%"), "\"100%\"");
    }

    #[test]
    fn new_run_shape() {
        let r = new_run("claude", "hello", vec!["claude".into(), "pi".into()]);
        assert_eq!(r.status, "running");
        assert_eq!(r.output, "");
        assert_eq!(r.exit_code, None);
        assert_eq!(r.finished_at, None);
        assert_eq!(r.delegated_to, vec!["claude", "pi"]);
        let v = serde_json::to_value(&r).unwrap();
        assert!(v.get("agentId").is_some());
        assert!(v.get("startedAt").is_some());
        assert!(v.get("delegatedTo").is_some());
        assert_eq!(v["exitCode"], Value::Null);
    }

    #[cfg(unix)]
    #[test]
    fn execute_captures_output_and_exit() {
        let agent = AgentDef {
            id: "echo".into(),
            name: "Echo".into(),
            cmd: "sh".into(),
            args: vec!["-c".into(), "echo hello-from-agent; echo err-line 1>&2; exit 0".into()],
            description: String::new(),
        };
        // prompt becomes $0 for sh -c; harmless
        let mut chunks = String::new();
        let out = execute_with_timeout(&agent, "ignored", 10_000, |c| chunks.push_str(c));
        assert_eq!(out.status, "done");
        assert_eq!(out.exit_code, Some(0));
        assert!(out.output.contains("hello-from-agent"));
        assert!(out.output.contains("err-line"));
        assert_eq!(chunks, out.output);
    }

    #[cfg(unix)]
    #[test]
    fn execute_nonzero_exit_and_spawn_error() {
        let agent = AgentDef {
            id: "f".into(),
            name: "f".into(),
            cmd: "sh".into(),
            args: vec!["-c".into(), "exit 3".into()],
            description: String::new(),
        };
        let out = execute_with_timeout(&agent, "x", 10_000, |_| {});
        assert_eq!(out.status, "error");
        assert_eq!(out.exit_code, Some(3));

        let missing = AgentDef {
            id: "m".into(),
            name: "m".into(),
            cmd: "definitely-not-a-real-cmd-4never".into(),
            args: vec![],
            description: String::new(),
        };
        let out = execute_with_timeout(&missing, "x", 10_000, |_| {});
        assert_eq!(out.status, "error");
        assert_eq!(out.exit_code, None);
        assert!(out.output.starts_with("spawn error: "));
    }

    #[cfg(unix)]
    #[test]
    fn execute_timeout_kills() {
        let agent = AgentDef {
            id: "sleep".into(),
            name: "sleep".into(),
            cmd: "sh".into(),
            args: vec!["-c".into(), "sleep 30".into()],
            description: String::new(),
        };
        let start = Instant::now();
        let out = execute_with_timeout(&agent, "x", 300, |_| {});
        assert!(start.elapsed() < Duration::from_secs(10));
        assert_eq!(out.status, "error");
        assert_eq!(out.exit_code, None);
        assert!(out.output.contains("[killed after 120s timeout]"));
    }

    #[test]
    fn availability_probe() {
        // `which which` / `where where` should succeed on any sane system;
        // a nonsense name should not.
        assert!(!is_available("definitely-not-a-real-cmd-4never"));
        if cfg!(unix) {
            assert!(is_available("sh"));
        }
    }
}
