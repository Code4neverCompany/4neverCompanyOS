//! 4neverCompany OS — first-run wizard (Rust / Tauri sidecar).
//! Stories 1.7-1.9 + 2.1 land here.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
