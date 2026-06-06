'use client';

import { useEffect } from 'react';

// ----------------------------------------------------------------------------
// WKWebView new-window/external-link bridge (DF-1/DF-6).
//
// macOS WKWebView (the Tauri shell) does NOT open `window.open`/`<a
// target="_blank">` as a new app window, so every "open in new tab" affordance —
// crucially the ~30 print/receipt links across the app — silently did nothing.
//
// Mounted once in the (app) layout, this captures clicks on `target="_blank"`
// anchors when running inside the shell and:
//   • internal links (same origin / relative, e.g. /print/...) → navigate the
//     SAME window (the print pages carry a print:hidden Back control), so the
//     page is actually reached and `printDocument()` can fire.
//   • external links (different origin, e.g. https://wa.me/...) → hand off to
//     the OS browser via the opener plugin.
// In a plain browser there is no Tauri global and this does nothing (native
// new-tab behavior is left intact).
// ----------------------------------------------------------------------------

function inTauri(): boolean {
  return typeof window !== 'undefined' && !!(window as unknown as { __TAURI__?: unknown }).__TAURI__;
}

export function TauriLinkInterceptor() {
  useEffect(() => {
    if (!inTauri()) return;

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      const anchor = (e.target as Element | null)?.closest('a');
      if (!anchor) return;
      if (anchor.target !== '_blank') return;
      const href = anchor.getAttribute('href');
      if (!href) return;

      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }

      e.preventDefault();
      if (url.origin === window.location.origin) {
        // Internal (print/receipt/etc.) — navigate in the same window.
        window.location.assign(url.href);
      } else {
        // External — open in the OS default browser.
        import('@tauri-apps/plugin-opener')
          .then((m) => m.openUrl(url.href))
          .catch((err) => console.error('failed to open external url', err));
      }
    };

    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  return null;
}
