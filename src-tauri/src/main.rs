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
mod updater;

#[cfg(not(debug_assertions))]
use std::process::Command;
use std::{thread, time::Duration};
use tauri::{Emitter, Manager, RunEvent};

const APP_PORT: u16 = 54331;

/// Resolve the bundled node binary. Tauri places externalBin sidecars NEXT TO
/// the main executable (Contents/MacOS/node on macOS), not under Resources — so
/// resolve relative to the current exe. Falls back to a `node` on PATH.
#[cfg(not(debug_assertions))]
fn node_sidecar(_app: &tauri::AppHandle) -> std::path::PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.join("node")))
        .filter(|p| p.exists())
        .unwrap_or_else(|| std::path::PathBuf::from("node"))
}

/// Run an offline lifecycle script (scripts/offline/<name>.mjs) with the bundled
/// node, inheriting the env (KAKO_OFFLINE, KAKO_EDITION, ports, KAKO_PG_BIN →
/// the bundled postgres bin dir).
#[cfg(not(debug_assertions))]
fn run_offline_script(app: &tauri::AppHandle, script: &str) -> std::io::Result<std::process::ExitStatus> {
    let node = node_sidecar(app);
    let script_path = app
        .path()
        .resolve(format!("resources/scripts/offline/{script}"), tauri::path::BaseDirectory::Resource)
        .expect("offline script resource");
    Command::new(node).arg(script_path).status()
}

/// Inject the runtime env the offline scripts + the bundled Next server need,
/// resolved from bundled resources, BEFORE any script/sidecar runs so children
/// inherit it: the bundled PostgreSQL tree (KAKO_PG_BIN), the standalone Next
/// server (KAKO_NEXT_SERVER), the PostgREST config template, and the local
/// data-layer (the per-build JWT secret + anon key written by build-app.mjs, and
/// the gateway URL). Release-only; dev runs the stack out-of-band.
#[cfg(not(debug_assertions))]
fn setup_offline_env(app: &tauri::AppHandle) {
    use tauri::path::BaseDirectory::Resource;
    let res = |p: &str| app.path().resolve(p, Resource);

    std::env::set_var("KAKO_OFFLINE", "1");
    std::env::set_var("NEXT_PUBLIC_SUPABASE_URL", format!("http://127.0.0.1:{APP_PORT}"));
    if let Ok(p) = res("resources/pgsql/bin") {
        std::env::set_var("KAKO_PG_BIN", p);
    }
    if let Ok(p) = res("resources/next-standalone/server.js") {
        std::env::set_var("KAKO_NEXT_SERVER", p);
    }
    if let Ok(p) = res("resources/postgrest.conf.template") {
        std::env::set_var("KAKO_PGRST_TEMPLATE", p);
    }
    if let Ok(p) = res("resources/offline-jwt-secret.txt") {
        if let Ok(s) = std::fs::read_to_string(&p) {
            let s = s.trim();
            if !s.is_empty() {
                std::env::set_var("KAKO_OFFLINE_JWT_SECRET", s);
            }
        }
    }
    if let Ok(p) = res("resources/anon-key.txt") {
        if let Ok(k) = std::fs::read_to_string(&p) {
            let k = k.trim();
            if !k.is_empty() {
                std::env::set_var("NEXT_PUBLIC_SUPABASE_ANON_KEY", k);
            }
        }
    }
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
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            device_fingerprint,
            updater::get_current_version,
            updater::get_channel,
            updater::set_channel,
            updater::check_for_update,
            updater::install_update,
        ])
        .setup(|app| {
            let handle = app.handle().clone();

            // Inject the bundled-resource runtime env (PG tree, Next server,
            // local data-layer secret/anon key) before anything boots. This is
            // the offline edition, so the local stack always applies.
            #[cfg(not(debug_assertions))]
            setup_offline_env(&handle);

            // Silent background update check on launch (no UI unless an update is
            // found). Runs on the async runtime, independent of the health gate.
            // A failure here is expected on a genuinely-offline box — we only log
            // it. If an update is available, emit an event the UI turns into a
            // toast/badge; we never block startup or pop a modal.
            let update_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let channel = updater::get_channel();
                match updater::check_for_update(update_handle.clone(), channel).await {
                    Ok(info) => {
                        if info.available || info.must_update {
                            eprintln!("update available on launch (must_update={})", info.must_update);
                            let _ = update_handle.emit("update-available", info);
                        } else {
                            eprintln!("no update available on launch");
                        }
                    }
                    Err(e) => eprintln!("launch update check skipped: {e}"),
                }
            });

            // Boot the stack off the UI thread: bootstrap (idempotent) → start
            // postgrest + the Next server → health-gate → show the window.
            thread::spawn(move || {
                // Release builds own the full stack: idempotent bootstrap, then
                // start the bundled postgrest + Next sidecars (torn down on exit
                // below). In `tauri dev` those resources aren't staged in the
                // debug target dir and the stack is started out-of-band
                // (`npm run offline:dev-stack`), so we skip the sidecar scripts
                // and just health-gate the already-running app server.
                #[cfg(not(debug_assertions))]
                {
                    if let Err(e) = run_offline_script(&handle, "bootstrap.mjs") {
                        eprintln!("offline bootstrap failed: {e}");
                    }
                    let _ = run_offline_script(&handle, "start-gateway.mjs");
                }
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
        .run(|_app_handle, event| {
            if let RunEvent::ExitRequested { .. } = event {
                // Graceful shutdown: stop postgres (and the gateway) so the data
                // dir is left clean for next launch. Dev runs the stack
                // out-of-band, so there is nothing for the shell to tear down.
                #[cfg(not(debug_assertions))]
                let _ = run_offline_script(_app_handle, "shutdown.mjs");
            }
        });
}
