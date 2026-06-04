/** ── Import Engine: client-side file parsing (no external deps) ────────────
 *  Parses CSV and JSON into { headers, rows } where each row is a string-keyed
 *  record. Excel (.xlsx) requires the optional `xlsx` package; when it is not
 *  installed we surface a clear message and the user can convert to CSV. The
 *  parser is generic — it has no knowledge of any entity. */

export interface ParsedSheet {
  headers: string[];
  rows: Record<string, string>[];
}

/** Minimal RFC-4180-ish CSV parser (handles quotes, commas, newlines in fields). */
export function parseCsv(text: string): ParsedSheet {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      pushField();
    } else if (c === '\n') {
      pushRow();
    } else if (c === '\r') {
      // ignore; handled by \n
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) pushRow();

  // Drop trailing empty rows.
  const clean = rows.filter((r) => r.some((v) => v.trim() !== ''));
  if (clean.length === 0) return { headers: [], rows: [] };
  const headers = clean[0].map((h) => h.trim());
  const out = clean.slice(1).map((r) => {
    const rec: Record<string, string> = {};
    headers.forEach((h, idx) => { rec[h] = (r[idx] ?? '').trim(); });
    return rec;
  });
  return { headers, rows: out };
}

/** Parse a JSON array of objects into the same shape. */
export function parseJson(text: string): ParsedSheet {
  const data = JSON.parse(text);
  const arr = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : null;
  if (!arr) throw new Error('JSON must be an array of objects (or { data: [...] }).');
  const headerSet = new Set<string>();
  for (const o of arr) Object.keys(o ?? {}).forEach((k) => headerSet.add(k));
  const headers = [...headerSet];
  const rows = arr.map((o: Record<string, unknown>) => {
    const rec: Record<string, string> = {};
    headers.forEach((h) => { rec[h] = o?.[h] == null ? '' : String(o[h]); });
    return rec;
  });
  return { headers, rows };
}

/** Dispatch by file extension/content. Returns a ParsedSheet or throws. */
export function parseFile(name: string, text: string): ParsedSheet {
  const lower = name.toLowerCase();
  if (lower.endsWith('.json')) return parseJson(text);
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) return parseCsv(text);
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    throw new Error('Excel files: please save as CSV and re-upload (xlsx support is optional).');
  }
  // Fallback: sniff — JSON starts with [ or {
  const t = text.trimStart();
  if (t.startsWith('[') || t.startsWith('{')) return parseJson(text);
  return parseCsv(text);
}
