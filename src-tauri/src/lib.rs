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
            // Unregister any stale service workers from pre-1.1.3 installs.
            // WebView2/WKWebView persist SW registrations across reinstalls;
            // this ensures the next load is always SW-free in the desktop app.
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.eval(
                    "if('serviceWorker'in navigator)\
                     navigator.serviceWorker.getRegistrations()\
                     .then(function(r){r.forEach(function(s){s.unregister()})})"
                );
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Logbuch")
}
