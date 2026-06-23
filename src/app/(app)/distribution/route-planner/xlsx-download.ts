// FV-4c — tiny client-side .xlsx download helper (no server, no schema). Mirrors the
// workspace's proven cross-browser anchor-click pattern; kept here so the verification
// reports can export without depending on the planner workspace component.

/** Reliable cross-browser download: the anchor must be in the document for `.click()`
 *  to fire in Firefox/Safari (and reliably in Chrome). */
export function downloadBytes(bytes: Uint8Array, filename: string, mime: string) {
  // Copy into a fresh ArrayBuffer to dodge shared-buffer/view edge cases across engines.
  const buf = bytes.slice().buffer;
  const url = URL.createObjectURL(new Blob([buf], { type: mime }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener'; a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export function downloadXlsx(bytes: Uint8Array, filename: string) {
  downloadBytes(bytes, filename, XLSX_MIME);
}

/** Stable, sortable timestamp for spreadsheet cells (YYYY-MM-DD HH:MM:SS). */
export function xlsxDate(ms: number | null): string {
  return ms ? new Date(ms).toISOString().slice(0, 19).replace('T', ' ') : '';
}
