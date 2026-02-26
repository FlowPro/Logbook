use tauri_plugin_updater::UpdaterExt;

/// Write arbitrary bytes to a user-chosen path (called after the native save dialog).
#[tauri::command]
fn save_file(path: String, data: Vec<u8>) -> Result<(), String> {
    std::fs::write(&path, &data).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![save_file])
        .setup(|app| {
            // Check for updates silently on startup; the native dialog handles user interaction
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Ok(updater) = handle.updater() {
                    let _ = updater.check().await;
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Logbuch")
}
