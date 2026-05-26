//! c4n-persona-supervisor — Wraps each persona process; captures stdout
//! and stderr line-by-line; appends each line as a JSON entry to the
//! per-persona vault log file; forwards lines unchanged to our own
//! stdout/stderr so an outer terminal (Zellij, an embedded xterm.js, the
//! user's shell) sees the original output.
//!
//! Architecture: D-11
//! Implementing stories:
//!   - **M1 Story 1.14a** — this file: library + binary primitive.
//!     `supervise()` is the entry point. Vault layout per Story 1.6.
//!   - **M1 Story 1.14b** (next) — wire `spawn_dev_persona` to invoke
//!     the binary instead of `claude` directly, so the Dev persona's
//!     stdout/stderr land in `<vault>/personas/dev/log/YYYY-MM-DD.jsonl`.
//!   - **M2 Story 2.18** — IPC subscription so the telemetry layer can
//!     consume the captured stream live.
//!   - **M3 Story 3.11** — pause / dismiss control surface.
//!
//! ## Output format
//!
//! Each line written to the JSONL log file is a single JSON object:
//!
//! ```json
//! {"ts": 1761575031942, "level": "info",  "line": "claude> hello"}
//! {"ts": 1761575032105, "level": "error", "line": "warning: foo"}
//! ```
//!
//! - `ts` — Unix milliseconds at the moment the line was captured.
//! - `level` — `"info"` for stdout, `"error"` for stderr. The simple
//!   stdout-vs-stderr inference is intentional for v1.14a; richer
//!   parsing (e.g., detecting `[ERROR]`-prefixed lines from a tool that
//!   logs everything to stdout) lands when a real consumer needs it.
//! - `line` — the captured line, with its trailing newline stripped.
//!   ANSI escape codes are preserved verbatim (the JSONL consumer can
//!   strip them; raw output keeps the forwarded copy visually correct).
//!
//! ## Why no PTY in 1.14a
//!
//! Spawning with raw stdio pipes (not a PTY) means interactive tools
//! like Claude Code may detect a non-TTY and run in degraded mode (no
//! prompt, no color). 1.14a accepts that trade-off because the supervisor
//! primitive's job is line capture; the *user-facing* terminal display
//! comes from Zellij owning the actual pane. PTY-wrapping the child for
//! richer interactive behavior is a follow-up if/when degradation
//! materially hurts the dev experience.

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use thiserror::Error;
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncWriteExt, BufReader};
use tokio::sync::Mutex;
use tracing::debug;

#[derive(Debug, Error)]
pub enum SupervisorError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),

    #[error("could not spawn child `{command}`: {source}")]
    Spawn {
        command: String,
        #[source]
        source: std::io::Error,
    },

    #[error("could not capture stdout/stderr from child — child returned with no piped handle")]
    NoPipedHandles,

    #[error("join: {0}")]
    Join(#[from] tokio::task::JoinError),

    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
}

/// What the supervisor needs to know to wrap a child process.
#[derive(Debug, Clone)]
pub struct SupervisorConfig {
    /// Persona identity (e.g. `"dev"`). Forms part of the log path
    /// `<vault>/personas/<persona_id>/log/<date>.jsonl`.
    pub persona_id: String,
    /// Vault root. The supervisor creates the persona log directory
    /// underneath this path if it doesn't exist yet.
    pub vault_path: PathBuf,
    /// Command to spawn (resolved via PATH unless absolute).
    pub command: String,
    /// Args passed to the child.
    pub args: Vec<String>,
    /// Optional working directory the child runs in. None ⇒ inherit
    /// from the supervisor's cwd.
    pub cwd: Option<PathBuf>,
}

/// One log entry. Serialized to a single line of JSONL.
#[derive(Debug, Serialize)]
struct LogEntry<'a> {
    /// Unix milliseconds at capture time.
    ts: u128,
    /// `"info"` for stdout, `"error"` for stderr.
    level: &'static str,
    /// The captured line, trailing newline stripped, ANSI preserved.
    line: &'a str,
}

/// Compute the log file path for a given vault + persona at today's date.
/// Public so callers (and tests) can predict where logs will land.
pub fn log_file_path(vault: &Path, persona_id: &str) -> PathBuf {
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
    vault
        .join("personas")
        .join(persona_id)
        .join("log")
        .join(format!("{today}.jsonl"))
}

/// Spawn the child process described by `config` and supervise it. Logs
/// each stdout/stderr line as JSONL into the per-day per-persona file,
/// AND forwards each line unchanged to the supervisor's own
/// stdout/stderr so an outer terminal can display them.
///
/// Returns the child's exit code (or `-1` if it exited via signal with
/// no code reported, which matches the convention used elsewhere in
/// this workspace — e.g. zellij-adapter's `kill()`).
pub async fn supervise(config: SupervisorConfig) -> Result<i32, SupervisorError> {
    debug!(
        persona = %config.persona_id,
        command = %config.command,
        args = ?config.args,
        "supervising child process"
    );

    let log_path = log_file_path(&config.vault_path, &config.persona_id);
    if let Some(parent) = log_path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }

    // Open the log file in append mode so multiple supervise() runs in
    // the same day extend the same file rather than overwriting.
    let log_file = tokio::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .await?;
    let log_writer = Arc::new(Mutex::new(log_file));

    let mut command = tokio::process::Command::new(&config.command);
    command
        .args(&config.args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(cwd) = &config.cwd {
        command.current_dir(cwd);
    }

    let mut child = command.spawn().map_err(|e| SupervisorError::Spawn {
        command: config.command.clone(),
        source: e,
    })?;

    let stdout = child.stdout.take().ok_or(SupervisorError::NoPipedHandles)?;
    let stderr = child.stderr.take().ok_or(SupervisorError::NoPipedHandles)?;

    let stdout_task = tokio::spawn(capture_pipe(
        stdout,
        "info",
        log_writer.clone(),
        Stream::Stdout,
    ));
    let stderr_task = tokio::spawn(capture_pipe(
        stderr,
        "error",
        log_writer.clone(),
        Stream::Stderr,
    ));

    let status = child.wait().await?;
    stdout_task.await??;
    stderr_task.await??;

    Ok(status.code().unwrap_or(-1))
}

/// Which of our own stdio handles to forward a captured line to.
#[derive(Copy, Clone)]
enum Stream {
    Stdout,
    Stderr,
}

/// Read lines from an arbitrary `AsyncRead` (stdout, stderr, or in tests
/// a `tokio::io::DuplexStream` / `Cursor`), JSONL-append each line to
/// `log_writer`, and forward the raw line to our own stdio.
async fn capture_pipe<R>(
    reader: R,
    level: &'static str,
    log_writer: Arc<Mutex<tokio::fs::File>>,
    forward_to: Stream,
) -> Result<(), SupervisorError>
where
    R: AsyncRead + Unpin,
{
    let mut lines = BufReader::new(reader).lines();
    while let Some(line) = lines.next_line().await? {
        // Build the entry. ts uses wall-clock millis since UNIX_EPOCH —
        // sufficient resolution for ordering log lines in a single
        // session; not intended as a precise event clock.
        let ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        let entry = LogEntry {
            ts,
            level,
            line: &line,
        };
        let json = serde_json::to_string(&entry)?;

        // Single lock acquisition per line keeps stdout and stderr
        // serialized in the file (alternative: interleaved bytes).
        {
            let mut writer = log_writer.lock().await;
            writer.write_all(json.as_bytes()).await?;
            writer.write_all(b"\n").await?;
            writer.flush().await?;
        }

        // Forward the original line to our own stdio so an outer
        // terminal (Zellij, an embedded xterm.js, the user's shell)
        // sees the child's output intact. println! / eprintln! both
        // append a newline, matching what the child sent before
        // line-buffering stripped it.
        match forward_to {
            Stream::Stdout => println!("{line}"),
            Stream::Stderr => eprintln!("{line}"),
        }
    }
    debug!(level, "capture pipe EOF");
    Ok(())
}

/// Returns the crate's identity string. Used by tests and module-presence checks.
pub fn package_name() -> &'static str {
    "c4n-persona-supervisor"
}

// ────────────────────────────────────────────────────────────────────
// Test helpers — kept public to the crate so the binary and external
// crate users can compose them.
// ────────────────────────────────────────────────────────────────────

/// Append a single line to the supervisor's JSONL log file. Public so
/// callers integrating the supervisor outside the `supervise()` flow
/// (e.g., emitting their own meta events) can use the same format.
///
/// `now_millis_provider` is injectable for tests; production callers
/// pass `|| default_now_millis()`.
pub async fn append_log_line(
    log_path: &Path,
    level: &'static str,
    line: &str,
    now_millis_provider: impl FnOnce() -> u128,
) -> Result<(), SupervisorError> {
    if let Some(parent) = log_path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    let mut writer = tokio::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)
        .await?;
    let entry = LogEntry {
        ts: now_millis_provider(),
        level,
        line,
    };
    let json = serde_json::to_string(&entry)?;
    writer.write_all(json.as_bytes()).await?;
    writer.write_all(b"\n").await?;
    writer.flush().await?;
    Ok(())
}

/// Default millis-since-epoch helper used by production callers.
pub fn default_now_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn package_name_is_correct() {
        assert_eq!(package_name(), "c4n-persona-supervisor");
    }

    #[test]
    fn log_path_format() {
        let path = log_file_path(Path::new("C:/vault"), "dev");
        // The file basename always ends with `.jsonl`.
        assert!(
            path.to_string_lossy().ends_with(".jsonl"),
            "got: {}",
            path.display()
        );
        // The path includes personas/dev/log/.
        let s = path.to_string_lossy().replace('\\', "/");
        assert!(s.contains("personas/dev/log/"), "got: {s}");
        // The date portion matches YYYY-MM-DD (10 chars + .jsonl = 16).
        let basename = path.file_name().unwrap().to_string_lossy().to_string();
        assert_eq!(basename.len(), "YYYY-MM-DD.jsonl".len());
        // 4-digit year + "-" + 2-digit month + "-" + 2-digit day:
        assert!(
            basename.chars().nth(4) == Some('-') && basename.chars().nth(7) == Some('-'),
            "got: {basename}"
        );
    }

    /// Verify the JSONL-append flow produces parseable lines with the
    /// expected fields. Uses `append_log_line` so we don't have to spawn
    /// a subprocess in tests.
    #[tokio::test]
    async fn append_log_line_writes_valid_jsonl() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("log.jsonl");

        append_log_line(&path, "info", "first line", || 1761575031942)
            .await
            .unwrap();
        append_log_line(&path, "error", "second line", || 1761575032105)
            .await
            .unwrap();

        let body = tokio::fs::read_to_string(&path).await.unwrap();
        let lines: Vec<&str> = body.trim_end().split('\n').collect();
        assert_eq!(lines.len(), 2);

        let first: serde_json::Value = serde_json::from_str(lines[0]).unwrap();
        assert_eq!(first["ts"], 1761575031942_u64);
        assert_eq!(first["level"], "info");
        assert_eq!(first["line"], "first line");

        let second: serde_json::Value = serde_json::from_str(lines[1]).unwrap();
        assert_eq!(second["level"], "error");
        assert_eq!(second["line"], "second line");
    }

    /// Verify `capture_pipe` reads from an arbitrary AsyncRead, appends
    /// JSONL entries to the log file, and forwards via println!.
    #[tokio::test]
    async fn capture_pipe_writes_each_line_as_jsonl() {
        let dir = TempDir::new().unwrap();
        let log_path = dir.path().join("capture.jsonl");
        let file = tokio::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_path)
            .await
            .unwrap();
        let writer = Arc::new(Mutex::new(file));

        // Feed three lines via an in-memory buffer.
        let input = b"hello\nworld\n  indented line\n";
        let reader = tokio::io::BufReader::new(&input[..]);

        capture_pipe(reader, "info", writer, Stream::Stdout)
            .await
            .unwrap();

        let body = tokio::fs::read_to_string(&log_path).await.unwrap();
        let entries: Vec<serde_json::Value> = body
            .trim_end()
            .split('\n')
            .map(|s| serde_json::from_str(s).unwrap())
            .collect();
        assert_eq!(entries.len(), 3);
        assert_eq!(entries[0]["line"], "hello");
        assert_eq!(entries[1]["line"], "world");
        assert_eq!(entries[2]["line"], "  indented line");
        for e in &entries {
            assert_eq!(e["level"], "info");
            assert!(e["ts"].as_u64().unwrap_or(0) > 0, "ts must be populated");
        }
    }

    /// Verify end-to-end: spawn a real child (`cargo --version` is
    /// available wherever this test runs since we run via cargo test),
    /// capture its output, validate the log file.
    #[tokio::test]
    async fn supervise_captures_real_subprocess_output() {
        let dir = TempDir::new().unwrap();
        let result = supervise(SupervisorConfig {
            persona_id: "test".to_string(),
            vault_path: dir.path().to_path_buf(),
            command: "cargo".to_string(),
            args: vec!["--version".to_string()],
            cwd: None,
        })
        .await
        .unwrap();
        assert_eq!(result, 0, "cargo --version should exit 0");

        // Find today's log file under personas/test/log/.
        let log = log_file_path(dir.path(), "test");
        assert!(log.exists(), "log file should exist at {}", log.display());
        let body = tokio::fs::read_to_string(&log).await.unwrap();
        assert!(!body.is_empty());

        // Every line must be parseable JSON with the expected shape.
        let lines: Vec<&str> = body.trim_end().split('\n').collect();
        assert!(!lines.is_empty(), "should have captured at least one line");
        for line in lines {
            let v: serde_json::Value = serde_json::from_str(line)
                .unwrap_or_else(|e| panic!("invalid JSONL line {line:?}: {e}"));
            assert!(v["ts"].is_number());
            assert!(matches!(v["level"].as_str(), Some("info") | Some("error")));
            assert!(v["line"].is_string());
        }

        // At least one line should mention "cargo" (the version banner).
        let body_lower = body.to_lowercase();
        assert!(
            body_lower.contains("cargo"),
            "captured output should mention cargo; got: {body}"
        );
    }
}
