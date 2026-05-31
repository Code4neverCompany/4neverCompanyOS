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

use c4n_persona_supervisor::{
    run_ephemeral, supervise, EphemeralConfig, NullNotifier, SupervisorConfig, SupervisorError,
};

#[tokio::main]
async fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().collect();

    // Story 3.6: ephemeral one-shot mode. The CLI runs its single task,
    // its stdout is written as an artifact under the project's reviews
    // dir, and it exits — no persona log dir, no long-lived session.
    //   c4n-persona-supervisor --ephemeral <slug> <project-id> <vault> -- <command> [args...]
    if args.get(1).map(String::as_str) == Some("--ephemeral") {
        return run_ephemeral_mode(&args).await;
    }

    let config = match parse_args(&args) {
        Ok(c) => c,
        Err(msg) => {
            eprintln!("c4n-persona-supervisor: {msg}");
            eprintln!();
            eprintln!(
                "usage: c4n-persona-supervisor <persona-id> <vault-path> -- <command> [args...]"
            );
            eprintln!(
                "       c4n-persona-supervisor --ephemeral <slug> <project-id> <vault-path> -- <command> [args...]"
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

/// Drive the ephemeral one-shot lifecycle from argv. The bus identity is
/// managed by [`NullNotifier`] until the bus client lands (see
/// `ephemeral` module docs); the lifecycle (artifact + clean exit + zero
/// orphans) is fully wired regardless.
async fn run_ephemeral_mode(args: &[String]) -> ExitCode {
    let config = match parse_ephemeral_args(args) {
        Ok(c) => c,
        Err(msg) => {
            eprintln!("c4n-persona-supervisor: {msg}");
            eprintln!();
            eprintln!(
                "usage: c4n-persona-supervisor --ephemeral <slug> <project-id> <vault-path> -- <command> [args...]"
            );
            return ExitCode::from(127);
        }
    };

    // run_ephemeral is synchronous (std::process); run it off the async
    // runtime so we never block the reactor thread.
    let result =
        tokio::task::spawn_blocking(move || run_ephemeral(config, &NullNotifier, None)).await;

    match result {
        Ok(Ok(outcome)) => {
            eprintln!(
                "c4n-persona-supervisor: ephemeral artifact written to {}",
                outcome.artifact_path.display()
            );
            ExitCode::from((outcome.exit_code & 0xFF) as u8)
        }
        Ok(Err(e)) => {
            eprintln!("c4n-persona-supervisor: {}", format_error(&e));
            ExitCode::from(127)
        }
        Err(join_err) => {
            eprintln!("c4n-persona-supervisor: ephemeral task panicked: {join_err}");
            ExitCode::from(127)
        }
    }
}

/// Parse the `--ephemeral` argv form:
///   args[1] : literal "--ephemeral"
///   args[2] : slug
///   args[3] : project-id
///   args[4] : vault path (must exist + be a dir)
///   args[5] : literal "--"
///   args[6..] : command + args
fn parse_ephemeral_args(args: &[String]) -> Result<EphemeralConfig, String> {
    if args.len() < 7 {
        return Err(format!(
            "too few arguments for --ephemeral (got {}, need at least 7: binary, --ephemeral, slug, project-id, vault, --, command)",
            args.len()
        ));
    }
    let slug = args[2].clone();
    if slug.is_empty() {
        return Err("slug must not be empty".to_string());
    }
    let project_id = args[3].clone();
    if project_id.is_empty() {
        return Err("project-id must not be empty".to_string());
    }
    let vault_path = std::path::PathBuf::from(&args[4]);
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
    if args[5] != "--" {
        return Err(format!(
            "expected literal `--` separator at position 5, got `{}`",
            args[5]
        ));
    }
    let command = args[6].clone();
    let child_args = args[7..].to_vec();

    Ok(EphemeralConfig {
        slug,
        project_id,
        vault_path,
        command,
        args: child_args,
        cwd: None,
    })
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

    // Story 3.5: between the vault path and the `--` separator, accept
    // zero or more `--project <id>` options. They populate the persona's
    // allowed shared-project scope for the vault scope monitor. Keeping
    // them optional preserves the original
    //   <persona-id> <vault> -- <command>
    // contract so existing callers don't break.
    let mut i = 3;
    let mut project_ids: Vec<String> = Vec::new();
    while i < args.len() && args[i] == "--project" {
        let id = args
            .get(i + 1)
            .ok_or_else(|| "`--project` requires an argument (a project id)".to_string())?;
        if id.is_empty() {
            return Err("`--project` id must not be empty".to_string());
        }
        project_ids.push(id.clone());
        i += 2;
    }

    let sep = args.get(i).map(String::as_str);
    if sep != Some("--") {
        return Err(format!(
            "expected literal `--` separator at position {i}, got `{}`",
            sep.unwrap_or("<end of args>")
        ));
    }

    let command = args
        .get(i + 1)
        .ok_or_else(|| "a command is required after the `--` separator".to_string())?
        .clone();
    let child_args = args[i + 2..].to_vec();

    Ok(SupervisorConfig {
        persona_id,
        vault_path,
        command,
        args: child_args,
        cwd: None,
        project_ids,
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
    fn parse_ephemeral_args_happy_path() {
        let dir = tempfile::TempDir::new().unwrap();
        let vault = dir.path().to_string_lossy().to_string();
        let cfg = parse_ephemeral_args(&make_args(&[
            "supervisor",
            "--ephemeral",
            "security-reviewer",
            "demo-proj-0a1b2c3d",
            &vault,
            "--",
            "claude",
            "-p",
            "review this PR",
        ]))
        .unwrap();
        assert_eq!(cfg.slug, "security-reviewer");
        assert_eq!(cfg.project_id, "demo-proj-0a1b2c3d");
        assert_eq!(cfg.command, "claude");
        assert_eq!(
            cfg.args,
            vec!["-p".to_string(), "review this PR".to_string()]
        );
    }

    #[test]
    fn parse_ephemeral_args_rejects_missing_command() {
        let dir = tempfile::TempDir::new().unwrap();
        let vault = dir.path().to_string_lossy().to_string();
        let r = parse_ephemeral_args(&make_args(&[
            "supervisor",
            "--ephemeral",
            "slug",
            "proj",
            &vault,
            "--",
        ]));
        assert!(r.is_err(), "command is required after `--`");
    }

    #[test]
    fn parse_args_accepts_project_flags() {
        let dir = tempfile::TempDir::new().unwrap();
        let vault = dir.path().to_string_lossy().to_string();
        let config = parse_args(&make_args(&[
            "supervisor",
            "dev",
            &vault,
            "--project",
            "proj-abc",
            "--project",
            "proj-xyz",
            "--",
            "claude",
            "--version",
        ]))
        .unwrap();
        assert_eq!(config.persona_id, "dev");
        assert_eq!(
            config.project_ids,
            vec!["proj-abc".to_string(), "proj-xyz".to_string()]
        );
        assert_eq!(config.command, "claude");
        assert_eq!(config.args, vec!["--version".to_string()]);
    }

    #[test]
    fn parse_args_project_flag_requires_value() {
        let dir = tempfile::TempDir::new().unwrap();
        let vault = dir.path().to_string_lossy().to_string();
        let r = parse_args(&make_args(&["supervisor", "dev", &vault, "--project"]));
        assert!(r.is_err());
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
