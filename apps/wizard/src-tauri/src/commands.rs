//! Tauri command surface for the first-run wizard.
//!
//! Each `#[tauri::command]` function below is callable from the front-end
//! React code via `invoke('name', args)` in @c4n/credential-storage and the
//! wizard's own UI hooks.

use c4n_credential_storage::{self as creds, CredentialError};
use serde::Serialize;
use std::path::PathBuf;

// ─── Vault setup (Story 1.7) ────────────────────────────────────

/// Suggested default vault location: `~/Documents/4neverCompanyOS-Vault`.
/// Falls back to `~/4neverCompanyOS-Vault` if Documents isn't available.
#[tauri::command]
pub fn choose_default_vault_location() -> Result<String, String> {
    let documents = dirs::document_dir();
    let home = dirs::home_dir().ok_or_else(|| "home directory not found".to_string())?;
    let base = documents.unwrap_or(home);
    let path = base.join("4neverCompanyOS-Vault");
    Ok(path.to_string_lossy().to_string())
}

/// Scaffold the vault directory layout at the given path per docs/vault-layout.md v1.0.
/// Creates: <vault>/.vault-layout-version, README.md, personas/, projects/.
/// Returns the absolute path that was scaffolded.
#[tauri::command]
pub fn scaffold_vault(path: String) -> Result<String, String> {
    let vault = PathBuf::from(&path);

    std::fs::create_dir_all(vault.join("personas"))
        .map_err(|e| format!("failed to create personas dir: {e}"))?;
    std::fs::create_dir_all(vault.join("projects"))
        .map_err(|e| format!("failed to create projects dir: {e}"))?;

    let version_file = vault.join(".vault-layout-version");
    std::fs::write(&version_file, "1.0\n")
        .map_err(|e| format!("failed to write .vault-layout-version: {e}"))?;

    let readme = vault.join("README.md");
    if !readme.exists() {
        std::fs::write(&readme, include_str!("../../assets/vault-readme.md"))
            .map_err(|e| format!("failed to write vault README: {e}"))?;
    }

    Ok(vault.to_string_lossy().to_string())
}

// ─── Workspace config persistence (Story 1.7) ───────────────────

/// The workspace config persisted at `~/.4nevercompanyos/config.toml`.
/// Schema is intentionally small: the wizard writes the vault location;
/// future steps will add more fields.
#[derive(serde::Deserialize, serde::Serialize, Debug)]
pub struct WorkspaceConfig {
    pub vault_path: String,
    /// Set after Story 1.8 wizard step lands a validated Anthropic key.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub anthropic_authenticated: Option<bool>,
    /// Set after Story 1.9 wizard step lands Claude Code auth.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub claude_code_authenticated: Option<bool>,
}

fn config_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or_else(|| "home directory not found".to_string())?;
    Ok(home.join(".4nevercompanyos").join("config.toml"))
}

/// Write the wizard config to `~/.4nevercompanyos/config.toml`. Creates the
/// `~/.4nevercompanyos/` directory if needed.
#[tauri::command]
pub fn write_config(config: WorkspaceConfig) -> Result<String, String> {
    let path = config_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("failed to create config dir: {e}"))?;
    }
    let content =
        toml::to_string_pretty(&config).map_err(|e| format!("failed to serialize config: {e}"))?;
    std::fs::write(&path, content).map_err(|e| format!("failed to write config: {e}"))?;
    Ok(path.to_string_lossy().to_string())
}

// ─── Credential ops (Story 1.10, used by 1.8 / 1.9 / 2.1) ───────

/// Tauri-friendly error type. `CredentialError` is already serializable, but
/// tauri::command expects a string for the error position unless we wrap it.
#[derive(Debug, Serialize)]
pub struct CmdError {
    pub kind: String,
    pub message: String,
}

impl From<CredentialError> for CmdError {
    fn from(err: CredentialError) -> Self {
        let kind = match &err {
            CredentialError::NotFound { .. } => "not-found",
            CredentialError::PermissionDenied(_) => "permission-denied",
            CredentialError::Other(_) => "other",
        };
        CmdError {
            kind: kind.to_string(),
            message: err.to_string(),
        }
    }
}

#[tauri::command]
pub fn store_credential(service: String, account: String, secret: String) -> Result<(), CmdError> {
    creds::set(&service, &account, &secret).map_err(Into::into)
}

#[tauri::command]
pub fn get_credential(service: String, account: String) -> Result<String, CmdError> {
    creds::get(&service, &account).map_err(Into::into)
}

#[tauri::command]
pub fn delete_credential(service: String, account: String) -> Result<(), CmdError> {
    creds::delete(&service, &account).map_err(Into::into)
}

// ─── Claude Code CLI presence check (Story 1.9) ────────────────

/// Returns the version string produced by `claude --version`, or an error
/// describing why the check failed. The wizard uses this to confirm
/// Claude Code is installed on PATH before declaring auth complete.
#[tauri::command]
pub fn check_claude_code_present() -> Result<String, String> {
    use std::process::Command;

    let output = Command::new("claude")
        .arg("--version")
        .output()
        .map_err(|e| {
            // ErrorKind::NotFound is the typical "not on PATH" failure.
            if e.kind() == std::io::ErrorKind::NotFound {
                "Claude Code CLI not found on PATH. Install it via Anthropic's official channel \
                 (https://docs.anthropic.com/claude-code) and re-run this wizard step."
                    .to_string()
            } else {
                format!("failed to execute `claude`: {e}")
            }
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
        return Err(format!(
            "`claude --version` exited with status {} — stderr: {}",
            output.status,
            stderr.trim()
        ));
    }

    let version = String::from_utf8_lossy(&output.stdout).into_owned();
    Ok(version.trim().to_string())
}
