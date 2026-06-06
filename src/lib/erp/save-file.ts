'use client';

// ----------------------------------------------------------------------------
// Cross-environment "save a file" (DF-3/DF-4).
//
// Inside the macOS WKWebView desktop shell, browser download mechanisms —
// `<a download>` blob clicks and `Content-Disposition: attachment` navigations —
// are silently ignored, so Export / Backup / CSV "downloads" did nothing. The
// Tauri shell ships the dialog + fs plugins; we present a native Save dialog and
// write the bytes to the chosen path. In a plain browser (next dev / web) there
// is no Tauri global, so we fall back to the classic blob-download.
//
// Mirrors the dual-path approach of `printDocument()` in ./print.ts.
// ----------------------------------------------------------------------------

interface TauriGlobal {
  __TAURI__?: unknown;
}

function inTauri(): boolean {
  return typeof window !== 'undefined' && !!(window as unknown as TauriGlobal).__TAURI__;
}

/** Optional dialog filter so the Save sheet defaults to the right extension. */
function filtersFor(filename: string): { name: string; extensions: string[] }[] | undefined {
  const ext = filename.split('.').pop();
  if (!ext || ext === filename) return undefined;
  return [{ name: ext.toUpperCase(), extensions: [ext] }];
}

function browserDownload(filename: string, data: string | Uint8Array, mime: string): void {
  const blob = new Blob([data as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Save `data` as `filename`. Returns true if a file was written (or the browser
 * download was triggered), false if the user cancelled the native dialog.
 * Never throws for the caller's normal flow — failures are reported via return.
 */
export async function saveFile(
  filename: string,
  data: string | Uint8Array,
  mime = 'application/octet-stream',
): Promise<boolean> {
  if (inTauri()) {
    try {
      const [{ save }, fs] = await Promise.all([
        import('@tauri-apps/plugin-dialog'),
        import('@tauri-apps/plugin-fs'),
      ]);
      const path = await save({ defaultPath: filename, filters: filtersFor(filename) });
      if (!path) return false; // user cancelled
      if (typeof data === 'string') {
        await fs.writeTextFile(path, data);
      } else {
        await fs.writeFile(path, data);
      }
      return true;
    } catch (e) {
      // Fall back to the browser path rather than leaving a dead button.
      console.error('native save failed; falling back to browser download', e);
    }
  }
  browserDownload(filename, data, mime);
  return true;
}

/** Convenience for text payloads (CSV/JSON). */
export function saveTextFile(filename: string, text: string, mime = 'text/plain;charset=utf-8'): Promise<boolean> {
  return saveFile(filename, text, mime);
}
