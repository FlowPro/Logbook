use tauri::Manager;

/// Write arbitrary bytes to a user-chosen path (called after the native save dialog).
#[tauri::command]
fn save_file(path: String, data: Vec<u8>) -> Result<(), String> {
    std::fs::write(&path, &data).map_err(|e| e.to_string())
}

/// Kill the NMEA bridge sidecar process by name.
/// Called from JS before installing an update so the installer can overwrite nmea-bridge.exe.
#[tauri::command]
fn kill_bridge() {
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("taskkill")
            .args(["/F", "/IM", "nmea-bridge.exe"])
            .output();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .invoke_handler(tauri::generate_handler![save_file, kill_bridge])
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
        .build(tauri::generate_context!())
        .expect("error while building Logbuch");

    app.run(|_app_handle, event| {
        // On Windows: kill nmea-bridge.exe on app exit so the NSIS updater
        // can overwrite the file (Windows locks running executables).
        if let tauri::RunEvent::Exit = event {
            #[cfg(target_os = "windows")]
            {
                let _ = std::process::Command::new("taskkill")
                    .args(["/F", "/IM", "nmea-bridge.exe"])
                    .output();
            }
        }
    });
}
