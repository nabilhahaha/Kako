'use client';

// ----------------------------------------------------------------------------
// Cross-environment print trigger.
//
// Inside the VANTORA desktop shell the UI runs in a macOS WKWebView, where the
// JS `window.print()` call is a SILENT NO-OP — clicking "Print" did nothing.
// Tauri exposes a working native print dialog from Rust via
// `WebviewWindow::print()`, which we wrap in the `print_webview` command
// (src-tauri/src/main.rs). We reach it through the same `window.__TAURI__`
// global the activation/updater UI already uses, so this stays dependency-free
// (no @tauri-apps/api import at module scope) and tree-shakes cleanly.
//
// In a plain browser (`next dev` / web preview) there is no Tauri global, so we
// fall back to the standard `window.print()`, which works fine there.
// ----------------------------------------------------------------------------

interface TauriInvoke {
  __TAURI__?: { core?: { invoke?: <T>(cmd: string) => Promise<T> } };
}

/** Open the print dialog, using the native Tauri path when running in the
 *  desktop shell and the browser pipeline otherwise. */
export async function printDocument(): Promise<void> {
  const inv = (window as unknown as TauriInvoke).__TAURI__?.core?.invoke;
  if (typeof inv === 'function') {
    try {
      await inv('print_webview');
      return;
    } catch (e) {
      // Native print unavailable on this platform — fall back to the browser
      // pipeline rather than leaving the user with a dead button.
      console.error('native print failed; falling back to window.print()', e);
    }
  }
  window.print();
}
