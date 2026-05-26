//! 4neverCompany OS — first-run wizard (Rust / Tauri sidecar).
//!
//! Stories landing here:
//!   - 1.7: vault location step (commands: choose_default_vault_location,
//!     scaffold_vault, write_config)
//!   - 1.8: Anthropic API key step (commands: store_credential, validate_anthropic_key)
//!   - 1.9: Claude Code OAuth step (commands: launch_claude_auth)
//!   - 2.1: Antigravity OAuth step (commands: launch_antigravity_auth)

mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::choose_default_vault_location,
            commands::scaffold_vault,
            commands::write_config,
            commands::store_credential,
            commands::get_credential,
            commands::delete_credential,
            commands::check_claude_code_present,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
