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
            // ── Windows: clear WebView2 HTTP cache before the webview starts ─────
            // WebView2 aggressively caches index.html and JS assets from the
            // tauri:// custom protocol. After an app update the new binary runs
            // but the old cached index.html (pointing to old JS hashes) is still
            // served, so the UI shows an outdated version. Deleting only the HTTP
            // response cache (Cache/ and Code Cache/) before the webview is created
            // forces a fresh load from the embedded binary assets. IndexedDB,
            // localStorage, and the Service Worker CacheStorage (pre-downloaded map
            // tiles) are in separate subdirectories and are NOT touched.
            #[cfg(target_os = "windows")]
            {
                if let Ok(data_dir) = app.path().app_local_data_dir() {
                    for entry in &["Cache", "Code Cache"] {
                        // Try direct layout (observed: %LocalAppData%\com.flowpro.logbuch\Cache)
                        let path_direct = data_dir.join(entry);
                        if path_direct.exists() {
                            let _ = std::fs::remove_dir_all(&path_direct);
                        }
                        // Also try EBWebView\Default layout (fallback for other WRY versions)
                        let path_ebwv = data_dir.join("EBWebView").join("Default").join(entry);
                        if path_ebwv.exists() {
                            let _ = std::fs::remove_dir_all(&path_ebwv);
                        }
                    }
                }
            }

            // ── Unregister stale SWs + clear Workbox caches via JS eval ─────────
            // Runs after page load. Belt-and-suspenders alongside the Rust cache
            // clear above. Preserves 'protomaps-tiles-precache' (user tile downloads).
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.eval(concat!(
                    "(async()=>{",
                    "var c=false;",
                    "if('serviceWorker'in navigator){",
                    "var r=await navigator.serviceWorker.getRegistrations();",
                    "for(var i=0;i<r.length;i++){await r[i].unregister();c=true;}",
                    "}",
                    "if('caches'in window){",
                    "var k=await caches.keys();",
                    "for(var i=0;i<k.length;i++){",
                    "if(k[i]!=='protomaps-tiles-precache'){await caches.delete(k[i]);c=true;}",
                    "}",
                    "}",
                    "if(c&&!sessionStorage.__tc){sessionStorage.__tc='1';location.reload();}",
                    "})();"
                ));
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
