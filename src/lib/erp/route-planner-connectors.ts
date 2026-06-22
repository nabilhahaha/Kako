import { parseCsv, type ParsedSheet } from './import-parse';

/**
 * Route Planner connectors — the "Fetch" step of the shared ingestion pipeline. Each
 * connector turns a source config into { headers, rows }; everything downstream
 * (Map → Validate → Data Health → Sync History → Audit) is identical to Manual Upload.
 *
 * Pilot scope (locked): on-demand manual sync only — no scheduler, no OAuth, no new
 * infra. Google Sheets via a published-CSV / export URL; Generic API via a JSON
 * endpoint with an OPTIONAL Bearer token. Secrets live in the admin-only source config
 * and are never returned to the client or echoed in errors/logs.
 */

export interface ConnectorConfig {
  /** google_sheets: the share / published / export URL of the sheet. */
  sheetUrl?: string;
  /** api_erp: the JSON endpoint URL. */
  endpoint?: string;
  /** api_erp: optional Bearer token (admin-only; never returned to the client). */
  token?: string;
  /** api_erp: optional JSON path to the array of rows (e.g. "data" or "result.items"). */
  rowsPath?: string;
}

const MAX_ROWS = 20_000;
const FETCH_TIMEOUT_MS = 15_000;

/** Convert a Google Sheets URL into its CSV-export form. Accepts edit / pub / export URLs. */
export function sheetCsvUrl(url: string): string | null {
  const u = url.trim();
  if (!u) return null;
  if (/output=csv|format=csv/i.test(u)) return u; // already a CSV/export/pub link
  const id = u.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1];
  if (!id) return null;
  const gid = u.match(/[#&?]gid=([0-9]+)/)?.[1] ?? '0';
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}

/** Pull an array of records out of a parsed JSON body (array, or a {path} to one). */
export function rowsFromJson(body: unknown, rowsPath?: string): Record<string, string>[] {
  let node: unknown = body;
  if (rowsPath) for (const k of rowsPath.split('.')) node = (node as Record<string, unknown> | null)?.[k];
  else if (!Array.isArray(node)) node = (node as Record<string, unknown> | null)?.data ?? (node as Record<string, unknown> | null)?.rows ?? (node as Record<string, unknown> | null)?.records ?? node;
  if (!Array.isArray(node)) return [];
  return (node as Record<string, unknown>[]).slice(0, MAX_ROWS).map((o) => {
    const row: Record<string, string> = {};
    for (const [k, v] of Object.entries(o ?? {})) row[k] = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return row;
  });
}

/** Headers across a set of JSON-derived rows (union of keys, stable order). */
function headersOf(rows: Record<string, string>[]): string[] {
  const seen = new Set<string>(); const out: string[] = [];
  for (const r of rows) for (const k of Object.keys(r)) if (!seen.has(k)) { seen.add(k); out.push(k); }
  return out;
}

async function fetchText(url: string, init?: RequestInit): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, redirect: 'follow' });
    if (!res.ok) throw new Error(`status_${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export type ConnectorType = 'google_sheets' | 'api_erp';

/**
 * Fetch rows for a connector source. Throws a TOKEN-FREE error (codes only) on failure
 * so secrets never leak into messages/logs.
 */
export async function fetchConnector(type: ConnectorType, config: ConnectorConfig): Promise<ParsedSheet> {
  if (type === 'google_sheets') {
    const csvUrl = sheetCsvUrl(config.sheetUrl ?? '');
    if (!csvUrl) throw new Error('bad_sheet_url');
    const text = await fetchText(csvUrl);
    const sheet = parseCsv(text);
    sheet.rows = sheet.rows.slice(0, MAX_ROWS);
    return sheet;
  }
  if (type === 'api_erp') {
    const endpoint = (config.endpoint ?? '').trim();
    if (!/^https?:\/\//i.test(endpoint)) throw new Error('bad_endpoint');
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (config.token) headers.Authorization = `Bearer ${config.token}`; // header only — never logged
    const text = await fetchText(endpoint, { headers });
    let body: unknown;
    try { body = JSON.parse(text); } catch { throw new Error('bad_json'); }
    const rows = rowsFromJson(body, config.rowsPath);
    return { headers: headersOf(rows), rows };
  }
  throw new Error('unsupported_type');
}

/** Strip secrets from a source config before it is ever returned to the client. */
export function redactConfig(config: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const c = { ...(config ?? {}) };
  const hasToken = typeof c.token === 'string' && c.token.length > 0;
  delete c.token;
  return { ...c, hasToken };
}
