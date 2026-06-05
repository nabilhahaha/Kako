// ============================================================================
// VANTORA Offline — Tauri shell / sidecar supervisor (P1 macOS, P2 Windows)
// ----------------------------------------------------------------------------
// Boots and supervises the three sidecars that make up the local stack, then
// shows the window once everything is healthy:
//
//   1. node  → runs the offline bootstrap (initdb / migrate-to-head / seed on
//              first run) using the SAME tested scripts/offline/*.mjs, then
//   2. postgres (started by the bootstrap script, kept running),
//   3. postgrest → the /rest + /rpc gateway supabase-js talks to,
//   4. node  → the standalone Next.js server (the app UI).
//
// The heavy lifting lives in the already-tested .mjs scripts; this Rust layer
// stays thin (spawn, health-gate, tray, graceful shutdown). Build on the target
// machine with the Tauri toolchain.
//
// NOTE: scaffolding — compiled/validated on macOS/Windows in P1/P2, not in the
// Linux CI container (no Rust/Tauri toolchain there, as planned).
// ============================================================================

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod fingerprint;

use std::process::Command;
use std::{thread, time::Duration};
use tauri::{Manager, RunEvent};

const APP_PORT: u16 = 54331;

/// Resolve the bundled node binary (Tauri places externalBin next to the app).
fn node_sidecar(app: &tauri::AppHandle) -> std::path::PathBuf {
    app.path()
        .resolve("binaries/node", tauri::path::BaseDirectory::Resource)
        .unwrap_or_else(|_| std::path::PathBuf::from("node"))
}

/// Run an offline lifecycle script (scripts/offline/<name>.mjs) with the bundled
/// node, inheriting the env (KAKO_OFFLINE, KAKO_EDITION, ports, KAKO_PG_BIN →
/// the bundled postgres bin dir).
fn run_offline_script(app: &tauri::AppHandle, script: &str) -> std::io::Result<std::process::ExitStatus> {
    let node = node_sidecar(app);
    let script_path = app
        .path()
        .resolve(format!("resources/scripts/offline/{script}"), tauri::path::BaseDirectory::Resource)
        .expect("offline script resource");
    Command::new(node).arg(script_path).status()
}

/// Poll the local app server until it answers (or time out).
fn wait_healthy(max: Duration) -> bool {
    let start = std::time::Instant::now();
    let url = format!("http://127.0.0.1:{APP_PORT}/api/health");
    while start.elapsed() < max {
        if std::net::TcpStream::connect(("127.0.0.1", APP_PORT)).is_ok() {
            // A TCP accept is enough to flip the window on; the app's own
            // /api/health (added in P1) is the deeper check.
            let _ = &url;
            return true;
        }
        thread::sleep(Duration::from_millis(300));
    }
    false
}

#[tauri::command]
fn device_fingerprint() -> Result<String, String> {
    fingerprint::collect().map_err(|e| e.to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![device_fingerprint])
        .setup(|app| {
            let handle = app.handle().clone();
            // Boot the stack off the UI thread: bootstrap (idempotent) → start
            // postgrest + the Next server → health-gate → show the window.
            thread::spawn(move || {
                if let Err(e) = run_offline_script(&handle, "bootstrap.mjs") {
                    eprintln!("offline bootstrap failed: {e}");
                }
                // postgrest + next server are long-running; spawn and forget
                // (they are torn down on exit below). Scripts to be added in P1.
                let _ = run_offline_script(&handle, "start-gateway.mjs");
                if wait_healthy(Duration::from_secs(60)) {
                    if let Some(win) = handle.get_webview_window("main") {
                        let _ = win.show();
                        let _ = win.set_focus();
                    }
                } else {
                    eprintln!("local stack did not become healthy in time");
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let RunEvent::ExitRequested { .. } = event {
                // Graceful shutdown: stop postgres (and the gateway) so the data
                // dir is left clean for next launch.
                let _ = run_offline_script(app_handle, "shutdown.mjs");
            }
        });
}
