import { saveTextFile } from '@/lib/erp/save-file';

// Builds the CSV text from rows of objects. Prepends a UTF-8 BOM so Excel
// renders Arabic correctly.
export function buildCsv(rows: Record<string, unknown>[]): string {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => esc(r[h])).join(',')),
  ];
  return '﻿' + lines.join('\r\n');
}

// Save a CSV. Uses the native Save dialog inside the Tauri desktop shell (where
// browser blob-downloads are a no-op) and the browser download otherwise.
export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  const name = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  return saveTextFile(name, buildCsv(rows), 'text/csv;charset=utf-8');
}
