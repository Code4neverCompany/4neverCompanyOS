//! c4n-github-sync — GitHub sync for vault configs, BMAD artifacts, skills, personas.
//!
//! Architecture: FR-33/34
//! Implementing stories: M5 Story 5.4 (push) + 5.5 (pull / cross-machine)
//!
//! Git-based: git push/pull via `git` CLI (always available on dev machines).
//! GitHub API calls via `ureq` for repo creation.
//! Credential (GitHub PAT) read from OS keychain via `c4n-credential-storage`.

use c4n_credential_storage::{CredentialError, GITHUB_ACCOUNT, GITHUB_SERVICE};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use std::process::Command;
use thiserror::Error;

// ─── Error types ─────────────────────────────────────────────────────────────

#[derive(Debug, Error)]
pub enum GithubSyncError {
    #[error("credential not found in keychain")]
    CredentialNotFound,

    #[error("keychain error: {0}")]
    CredentialStorage(#[from] CredentialError),

    #[error("git error: {0}")]
    Git(String),

    #[error("GitHub API error {status}: {body}")]
    Api { status: u16, body: String },

    #[error("vault path not configured")]
    VaultNotConfigured,

    #[error("not a git repository: {0}")]
    NotARepo(String),
}

impl Serialize for GithubSyncError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

// ─── Sync policy ─────────────────────────────────────────────────────────────

/// Categories that can be synced (FR-33 default policy).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SyncCategory {
    PersonaFiles,
    PersonaSkills,
    PersonaMemory,
    PersonaMeta,
    BmadArtifacts,
    ProjectPersonas,
    ProjectReviews,
    ProjectContext,
    DecisionLog,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncPolicy {
    pub categories: HashMap<String, bool>,
}

impl Default for SyncPolicy {
    fn default() -> Self {
        let mut cats = HashMap::new();
        cats.insert("persona-files".to_string(), true);
        cats.insert("persona-skills".to_string(), true);
        cats.insert("persona-meta".to_string(), true);
        cats.insert("bmad-artifacts".to_string(), true);
        cats.insert("project-personas".to_string(), true);
        cats.insert("project-reviews".to_string(), true);
        cats.insert("project-context".to_string(), true);
        cats.insert("decision-log".to_string(), true);
        cats.insert("persona-memory".to_string(), false);
        SyncPolicy { categories: cats }
    }
}

// ─── Sync result ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncResult {
    pub ok: bool,
    pub pushed: usize,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncStatus {
    pub is_repo: bool,
    pub remote_configured: bool,
    pub ahead: usize,
    pub behind: usize,
    pub current_branch: Option<String>,
}

// ─── Git helpers ─────────────────────────────────────────────────────────────

// ─── GitHub API helpers ───────────────────────────────────────────────────────

fn github_api(
    token: &str,
    method: &str,
    url: &str,
    body: Option<&str>,
) -> Result<(u16, String), GithubSyncError> {
    let agent = ureq::Agent::new();

    let req = match method {
        "GET" => agent.get(url),
        "POST" => agent.post(url),
        "PUT" => agent.put(url),
        "DELETE" => agent.delete(url),
        "PATCH" => agent.patch(url),
        _ => {
            return Err(GithubSyncError::Git(format!(
                "unsupported method: {method}"
            )))
        }
    };

    let req = req
        .set("Authorization", &format!("Bearer {token}"))
        .set("Accept", "application/vnd.github+json")
        .set("X-GitHub-Api-Version", "2022-11-28")
        .set("User-Agent", "4neverCompany-OS/1.0");

    let resp: std::result::Result<ureq::Response, ureq::Error> = if let Some(b) = body {
        req.set("Content-Type", "application/json").send_string(b)
    } else {
        req.call()
    };

    match resp {
        Ok(r) => {
            let status = r.status();
            let resp_body = r.into_string().unwrap_or_default();
            Ok((status, resp_body))
        }
        Err(ureq::Error::Status(code, _)) => Ok((code, String::new())),
        Err(ureq::Error::Transport(_)) => Ok((500, String::new())),
    }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/// Get the GitHub PAT from keychain. Returns error if not found.
pub fn get_github_token() -> Result<String, GithubSyncError> {
    c4n_credential_storage::get(GITHUB_SERVICE, GITHUB_ACCOUNT).map_err(|e| match e {
        CredentialError::NotFound { .. } => GithubSyncError::CredentialNotFound,
        _ => GithubSyncError::CredentialStorage(e),
    })
}

/// Check sync status — is the vault a git repo, does it have a remote, ahead/behind.
pub fn sync_status(vault_path: &str) -> Result<SyncStatus, GithubSyncError> {
    let vault = Path::new(vault_path);

    // Check if it's a git repo
    let is_repo = Command::new("git")
        .args(["rev-parse", "--git-dir"])
        .current_dir(vault)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    if !is_repo {
        return Ok(SyncStatus {
            is_repo: false,
            remote_configured: false,
            ahead: 0,
            behind: 0,
            current_branch: None,
        });
    }

    // Get current branch
    let current_branch = Command::new("git")
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .current_dir(vault)
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string());

    // Get remote URL
    let remote_url = Command::new("git")
        .args(["remote", "get-url", "origin"])
        .current_dir(vault)
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string());

    let remote_configured = remote_url.is_some();

    // Fetch and get ahead/behind
    let (ahead, behind) = if remote_configured {
        let _ = Command::new("git")
            .args(["fetch", "origin"])
            .current_dir(vault)
            .output();

        let ahead_str = Command::new("git")
            .args(["rev-list", "--left-only", "--count", "HEAD...origin/HEAD"])
            .current_dir(vault)
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .unwrap_or_default();

        let behind_str = Command::new("git")
            .args(["rev-list", "--right-only", "--count", "HEAD...origin/HEAD"])
            .current_dir(vault)
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .unwrap_or_default();

        (
            ahead_str.parse().unwrap_or(0),
            behind_str.parse().unwrap_or(0),
        )
    } else {
        (0, 0)
    };

    Ok(SyncStatus {
        is_repo: true,
        remote_configured,
        ahead,
        behind,
        current_branch,
    })
}

/// Stage files matching the sync policy and push to the configured remote.
pub fn sync_push(vault_path: &str, policy: &SyncPolicy) -> Result<SyncResult, GithubSyncError> {
    let vault = Path::new(vault_path);
    let token = get_github_token()?;

    // Ensure remote has token embedded for auth
    let remote_url = Command::new("git")
        .args(["remote", "get-url", "origin"])
        .current_dir(vault)
        .output()
        .map_err(|e| GithubSyncError::Git(e.to_string()))?;

    if !remote_url.status.success() {
        return Ok(SyncResult {
            ok: false,
            pushed: 0,
            errors: vec!["No remote configured. Run github_sync_init first.".to_string()],
        });
    }

    // Get tracked files
    let tracked = Command::new("git")
        .args(["ls-files", "-z"])
        .current_dir(vault)
        .output()
        .map_err(|e| GithubSyncError::Git(e.to_string()))?;

    let files: Vec<String> = String::from_utf8_lossy(&tracked.stdout)
        .split('\0')
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .filter(|f| matches_policy(f, policy))
        .collect();

    if files.is_empty() {
        return Ok(SyncResult {
            ok: true,
            pushed: 0,
            errors: vec![],
        });
    }

    // Stage files
    for file in &files {
        let output = Command::new("git")
            .args(["add", "--force", file])
            .current_dir(vault)
            .output()
            .map_err(|e| GithubSyncError::Git(e.to_string()))?;

        if !output.status.success() {
            return Ok(SyncResult {
                ok: false,
                pushed: 0,
                errors: vec![format!(
                    "failed to stage {}: {}",
                    file,
                    String::from_utf8_lossy(&output.stderr)
                )],
            });
        }
    }

    // Commit
    let timestamp = chrono::Utc::now().to_rfc3339();
    let commit_msg = format!(
        "4neverCompany OS sync {}\n\nCategories: {}",
        timestamp,
        policy
            .categories
            .iter()
            .filter(|(_, on)| **on)
            .map(|(cat, _)| cat.as_str())
            .collect::<Vec<_>>()
            .join(", ")
    );

    let commit_output = Command::new("git")
        .args(["commit", "-m", &commit_msg])
        .current_dir(vault)
        .output()
        .map_err(|e| GithubSyncError::Git(e.to_string()))?;

    if !commit_output.status.success() {
        let stderr = String::from_utf8_lossy(&commit_output.stderr);
        // "nothing to commit" is not an error
        if !stderr.contains("nothing to commit") {
            return Ok(SyncResult {
                ok: false,
                pushed: 0,
                errors: vec![format!("commit failed: {stderr}")],
            });
        }
    }

    // Push with token embedded in remote URL
    let remote_str = String::from_utf8_lossy(&remote_url.stdout);
    let remote_trimmed = remote_str.trim();
    let token_remote = if remote_trimmed.starts_with("https://") {
        let without_https = remote_trimmed.trim_start_matches("https://");
        format!("https://{token}@{without_https}")
    } else {
        remote_trimmed.to_string()
    };

    Command::new("git")
        .args(["remote", "set-url", "origin", &token_remote])
        .current_dir(vault)
        .output()
        .ok();

    let push_output = Command::new("git")
        .args(["push", "origin", "HEAD", "--force"])
        .current_dir(vault)
        .output()
        .map_err(|e| GithubSyncError::Git(e.to_string()))?;

    if !push_output.status.success() {
        return Ok(SyncResult {
            ok: false,
            pushed: 0,
            errors: vec![format!(
                "push failed: {}",
                String::from_utf8_lossy(&push_output.stderr)
            )],
        });
    }

    Ok(SyncResult {
        ok: true,
        pushed: files.len(),
        errors: vec![],
    })
}

/// Pull from the configured GitHub remote.
pub fn sync_pull(vault_path: &str) -> Result<SyncResult, GithubSyncError> {
    let vault = Path::new(vault_path);
    let token = get_github_token()?;

    let remote_url = Command::new("git")
        .args(["remote", "get-url", "origin"])
        .current_dir(vault)
        .output()
        .map_err(|e| GithubSyncError::Git(e.to_string()))?;

    if !remote_url.status.success() {
        return Ok(SyncResult {
            ok: false,
            pushed: 0,
            errors: vec!["No remote configured. Run github_sync_init first.".to_string()],
        });
    }

    // Embed token in remote URL
    let remote_str = String::from_utf8_lossy(&remote_url.stdout);
    let remote_trimmed = remote_str.trim();
    let token_remote = if remote_trimmed.starts_with("https://") {
        let without_https = remote_trimmed.trim_start_matches("https://");
        format!("https://{token}@{without_https}")
    } else {
        remote_trimmed.to_string()
    };

    Command::new("git")
        .args(["remote", "set-url", "origin", &token_remote])
        .current_dir(vault)
        .output()
        .ok();

    let pull_output = Command::new("git")
        .args(["pull", "--rebase", "origin"])
        .current_dir(vault)
        .output()
        .map_err(|e| GithubSyncError::Git(e.to_string()))?;

    if !pull_output.status.success() {
        return Ok(SyncResult {
            ok: false,
            pushed: 0,
            errors: vec![format!(
                "pull failed: {}",
                String::from_utf8_lossy(&pull_output.stderr)
            )],
        });
    }

    Ok(SyncResult {
        ok: true,
        pushed: 0,
        errors: vec![],
    })
}

/// Create a GitHub repo and configure the vault as a git repo with the remote.
pub fn sync_init(
    vault_path: &str,
    repo_name: &str,
    is_private: bool,
) -> Result<(String, String), GithubSyncError> {
    let vault = Path::new(vault_path);
    let token = get_github_token()?;

    // Check if already a git repo
    let is_repo = Command::new("git")
        .args(["rev-parse", "--git-dir"])
        .current_dir(vault)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    if !is_repo {
        let init_output = Command::new("git")
            .args(["init"])
            .current_dir(vault)
            .output()
            .map_err(|e| GithubSyncError::Git(e.to_string()))?;

        if !init_output.status.success() {
            return Err(GithubSyncError::Git(
                String::from_utf8_lossy(&init_output.stderr).to_string(),
            ));
        }
    }

    // Create GitHub repo via API
    let body = serde_json::json!({
        "name": repo_name,
        "private": is_private,
        "auto_init": false,
        "description": "4neverCompany OS workspace vault"
    });

    let (status, resp_body) = github_api(
        &token,
        "POST",
        "https://api.github.com/user/repos",
        Some(&body.to_string()),
    )?;

    if status != 201 && status != 200 {
        return Err(GithubSyncError::Api {
            status,
            body: resp_body,
        });
    }

    let repo: serde_json::Value =
        serde_json::from_str(&resp_body).map_err(|e| GithubSyncError::Git(e.to_string()))?;

    let full_name = repo["full_name"]
        .as_str()
        .ok_or_else(|| GithubSyncError::Git("GitHub response missing full_name".to_string()))?;
    let html_url = repo["html_url"]
        .as_str()
        .ok_or_else(|| GithubSyncError::Git("GitHub response missing html_url".to_string()))?;
    let default_branch = repo["default_branch"]
        .as_str()
        .unwrap_or("main")
        .to_string();

    // Add remote with token embedded
    let https_url = format!("https://{token}@github.com/{full_name}.git");

    let remote_output = Command::new("git")
        .args(["remote", "add", "origin", &https_url])
        .current_dir(vault)
        .output();

    // If origin already exists, set-url
    if remote_output
        .as_ref()
        .map(|o| !o.status.success())
        .unwrap_or(false)
    {
        Command::new("git")
            .args(["remote", "set-url", "origin", &https_url])
            .current_dir(vault)
            .output()
            .ok();
    }

    Ok((html_url.to_string(), default_branch))
}

// ─── Policy matching ─────────────────────────────────────────────────────────

fn matches_policy(file_path: &str, policy: &SyncPolicy) -> bool {
    let patterns: &[(&[&str], &str)] = &[
        (&["personas/*/persona.md"], "persona-files"),
        (&["personas/*/skills/*.md"], "persona-skills"),
        (&["personas/*/memory/*.md"], "persona-memory"),
        (&["personas/*/.persona-meta.json"], "persona-meta"),
        (&["projects/*/bmad/**"], "bmad-artifacts"),
        (&["projects/*/personas/**"], "project-personas"),
        (&["projects/*/reviews/**"], "project-reviews"),
        (&["projects/*/.project-context.md"], "project-context"),
        (&["projects/*/.decision-log.md"], "decision-log"),
    ];

    let never_sync = &[
        "personas/*/log/**",
        "personas/*/conflict-log.md",
        "personas/*/out-of-scope-writes.log",
        "personas/*/claude.md",
        "personas/*/agy.md",
        "personas/*/agent.md",
        "projects/*/.workflow-state.json",
    ];

    if never_sync.iter().any(|p| glob_match(file_path, p)) {
        return false;
    }

    for (pats, cat_key) in patterns {
        if policy.categories.get(*cat_key) != Some(&true) {
            continue;
        }
        if pats.iter().any(|p| glob_match(file_path, p)) {
            return true;
        }
    }

    false
}

fn glob_match(path: &str, pattern: &str) -> bool {
    let path_parts: Vec<&str> = path.split('/').collect();
    let pattern_parts: Vec<&str> = pattern.split('/').collect();

    let mut pi = 0;
    for part in &path_parts {
        if pi >= pattern_parts.len() {
            return false;
        }
        let pp = pattern_parts[pi];
        if pp == "**" {
            if pi == pattern_parts.len() - 1 {
                return true;
            }
            let next = pattern_parts[pi + 1];
            if let Some(idx) = path_parts[pi..].iter().position(|&p| p == next) {
                pi += idx + 1;
                continue;
            }
            return false;
        }
        if pp == "*" {
            pi += 1;
            continue;
        }
        if pp != *part {
            return false;
        }
        pi += 1;
    }
    pi == pattern_parts.len()
}
