//! `c4n-persona-supervisor` binary.
//!
//! Thin CLI wrapper around the library's `supervise()` entry point.
//! Designed to be invoked by `spawn_dev_persona` (M1 Story 1.14b) via
//! Zellij — i.e., the command line Zellij actually runs becomes:
//!
//!   c4n-persona-supervisor <persona-id> <vault-path> -- <command> [args...]
//!
//! The supervisor then exec-wraps the child, captures stdout/stderr to
//! JSONL, and forwards the raw lines to its own stdio so Zellij's pane
//! display stays correct.
//!
//! ## Argument parsing
//!
//! Positional + the `--` separator, no clap/structopt — keeps the
//! binary small and the argv contract obvious:
//!
//!   args[1] : persona_id (e.g. "dev")
//!   args[2] : vault root (e.g. "/home/maurice/4nco-vault")
//!   args[3] : literal "--"
//!   args[4..] : command + its own args (passed through verbatim)
//!
//! ## Exit code
//!
//! Mirrors the child's exit code. If the supervisor itself fails before
//! it can spawn the child (bad args, vault path unreachable, etc.) the
//! supervisor exits 127 — the conventional "command not found / setup
//! failed" code that distinguishes infra failure from child failure.

use std::process::ExitCode;

use c4n_persona_supervisor::{supervise, SupervisorConfig, SupervisorError};

#[tokio::main]
async fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().collect();
    let config = match parse_args(&args) {
        Ok(c) => c,
        Err(msg) => {
            eprintln!("c4n-persona-supervisor: {msg}");
            eprintln!();
            eprintln!(
                "usage: c4n-persona-supervisor <persona-id> <vault-path> -- <command> [args...]"
            );
            return ExitCode::from(127);
        }
    };

    match supervise(config).await {
        Ok(code) => {
            // Clamp negative or oversized codes into a u8 for ExitCode.
            // Conventional shells truncate to the low 8 bits anyway; we
            // do the same explicitly for portability.
            let truncated = (code & 0xFF) as u8;
            ExitCode::from(truncated)
        }
        Err(e) => {
            // Distinguish supervisor-side errors (127) from child-side
            // exit codes that happened to be 127.
            eprintln!("c4n-persona-supervisor: {}", format_error(&e));
            ExitCode::from(127)
        }
    }
}

fn parse_args(args: &[String]) -> Result<SupervisorConfig, String> {
    // args[0] is the binary path
    if args.len() < 5 {
        return Err(format!(
            "too few arguments (got {}, need at least 5: binary, persona-id, vault, --, command)",
            args.len()
        ));
    }
    let persona_id = args[1].clone();
    if persona_id.is_empty() {
        return Err("persona-id must not be empty".to_string());
    }

    let vault_path = std::path::PathBuf::from(&args[2]);
    if !vault_path.exists() {
        return Err(format!(
            "vault path does not exist: {}",
            vault_path.display()
        ));
    }
    if !vault_path.is_dir() {
        return Err(format!(
            "vault path is not a directory: {}",
            vault_path.display()
        ));
    }

    if args[3] != "--" {
        return Err(format!(
            "expected literal `--` separator at position 3, got `{}`",
            args[3]
        ));
    }

    let command = args[4].clone();
    let child_args = args[5..].to_vec();

    Ok(SupervisorConfig {
        persona_id,
        vault_path,
        command,
        args: child_args,
        cwd: None,
    })
}

fn format_error(e: &SupervisorError) -> String {
    // Walk the source chain for the full diagnostic.
    let mut s = e.to_string();
    let mut source: Option<&dyn std::error::Error> = std::error::Error::source(e);
    while let Some(src) = source {
        s.push_str(": ");
        s.push_str(&src.to_string());
        source = src.source();
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_args(items: &[&str]) -> Vec<String> {
        items.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn parse_args_rejects_too_few() {
        let r = parse_args(&make_args(&["supervisor"]));
        assert!(r.is_err());
        let r = parse_args(&make_args(&["supervisor", "dev"]));
        assert!(r.is_err());
        let r = parse_args(&make_args(&["supervisor", "dev", "/tmp", "--"]));
        assert!(r.is_err(), "command is required after `--`");
    }

    #[test]
    fn parse_args_rejects_missing_dash_separator() {
        let dir = tempfile::TempDir::new().unwrap();
        let vault = dir.path().to_string_lossy().to_string();
        let r = parse_args(&make_args(&[
            "supervisor",
            "dev",
            &vault,
            "claude",
            "--help",
        ]));
        assert!(r.is_err());
        assert!(r.unwrap_err().contains("`--`"));
    }

    #[test]
    fn parse_args_rejects_empty_persona_id() {
        let dir = tempfile::TempDir::new().unwrap();
        let vault = dir.path().to_string_lossy().to_string();
        let r = parse_args(&make_args(&["supervisor", "", &vault, "--", "echo"]));
        assert!(r.is_err());
        assert!(r.unwrap_err().contains("persona-id"));
    }

    #[test]
    fn parse_args_rejects_nonexistent_vault() {
        let r = parse_args(&make_args(&[
            "supervisor",
            "dev",
            "/path/that/does/not/exist/anywhere",
            "--",
            "echo",
        ]));
        assert!(r.is_err());
        assert!(r.unwrap_err().contains("does not exist"));
    }

    #[test]
    fn parse_args_happy_path() {
        let dir = tempfile::TempDir::new().unwrap();
        let vault = dir.path().to_string_lossy().to_string();
        let config = parse_args(&make_args(&[
            "supervisor",
            "dev",
            &vault,
            "--",
            "claude",
            "--version",
        ]))
        .unwrap();
        assert_eq!(config.persona_id, "dev");
        assert_eq!(config.vault_path.to_string_lossy(), vault);
        assert_eq!(config.command, "claude");
        assert_eq!(config.args, vec!["--version".to_string()]);
    }
}
