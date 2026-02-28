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

/// Clear the WebView2 HTTP response cache before installing an update.
/// Called from the JS update flow (Settings → Update installieren) so the new
/// binary always starts with a clean cache instead of serving stale index.html.
/// Only the HTTP cache is deleted — IndexedDB, localStorage, and the
/// Service Worker CacheStorage (pre-downloaded map tiles) are preserved.
#[tauri::command]
fn clear_webview_cache(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        if let Ok(data_dir) = app.path().app_local_data_dir() {
            for entry in &["Cache", "Code Cache"] {
                // Direct layout: %LocalAppData%\com.flowpro.logbuch\Cache
                let path_direct = data_dir.join(entry);
                if path_direct.exists() {
                    let _ = std::fs::remove_dir_all(&path_direct);
                }
                // Fallback: %LocalAppData%\com.flowpro.logbuch\EBWebView\Default\Cache
                let path_ebwv = data_dir.join("EBWebView").join("Default").join(entry);
                if path_ebwv.exists() {
                    let _ = std::fs::remove_dir_all(&path_ebwv);
                }
            }
        }
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .invoke_handler(tauri::generate_handler![save_file, kill_bridge, clear_webview_cache])
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

            // Windows: WebView2 occasionally fails to load http://tauri.localhost/ on startup
            // due to a race between window creation and custom protocol handler registration.
            // After 1 s, check whether React has rendered into #root. If not (error page or
            // blank page), trigger a reload — by then the protocol handler is always ready.
            #[cfg(target_os = "windows")]
            if let Some(window) = app.get_webview_window("main") {
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(1000));
                    let _ = window.eval(
                        "(function(){\
                            var r=document.getElementById('root');\
                            if(!r||!r.firstChild){window.location.reload();}\
                         })()"
                    );
                });
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
