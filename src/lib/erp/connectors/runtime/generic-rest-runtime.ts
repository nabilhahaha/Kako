/** ── Generic REST runtime (Phase 2C-2) ─────────────────────────────────────
 *  The Node-side pull/push transport for the generic_rest adapter, used by the
 *  sync dispatcher. Pure functions with an injectable fetch so they're unit-
 *  testable. No DB/session deps. (csv_sftp transport is a later sub-slice.) */

type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) =>
  Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> }>;

/** Navigate a dot-path into a JSON object (e.g. "data.items"). Empty → the value. */
export function getByPath(obj: unknown, path?: string): unknown {
  if (!path) return obj;
  return path.split('.').reduce<unknown>((acc, k) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[k];
    return undefined;
  }, obj);
}

/** Rename external keys → VANTORA entity field keys via a field map (identity if none). */
export function mapRecord(rec: Record<string, unknown>, fieldMap?: Record<string, string>): Record<string, unknown> {
  if (!fieldMap || Object.keys(fieldMap).length === 0) return rec;
  const out: Record<string, unknown> = {};
  for (const [from, to] of Object.entries(fieldMap)) {
    if (rec[from] !== undefined) out[to] = rec[from];
  }
  return out;
}

function authHeaders(authHeader?: string, authScheme?: string, token?: string | null): Record<string, string> {
  if (!token) return {};
  const header = authHeader && authHeader.trim() ? authHeader.trim() : 'Authorization';
  const value = authScheme && authScheme.trim() ? `${authScheme.trim()} ${token}` : token;
  return { [header]: value };
}

export interface PullArgs {
  baseUrl: string; path?: string;
  authHeader?: string; authScheme?: string; token?: string | null;
  recordsPath?: string; cursorParam?: string; cursor?: string | null; cursorField?: string;
  fieldMap?: Record<string, string>;
  fetchImpl?: FetchLike;
}
export interface PullResult { records: Record<string, unknown>[]; cursorAfter: string | null }

export async function pullGenericRest(args: PullArgs): Promise<PullResult> {
  const f = (args.fetchImpl ?? (globalThis.fetch as unknown as FetchLike));
  let url = (args.baseUrl ?? '').replace(/\/$/, '') + (args.path ?? '');
  if (args.cursor && args.cursorParam) {
    url += (url.includes('?') ? '&' : '?') + `${encodeURIComponent(args.cursorParam)}=${encodeURIComponent(args.cursor)}`;
  }
  const res = await f(url, { method: 'GET', headers: { Accept: 'application/json', ...authHeaders(args.authHeader, args.authScheme, args.token) } });
  if (!res.ok) throw new Error(`pull failed: HTTP ${res.status}`);
  const json = await res.json();
  const raw = getByPath(json, args.recordsPath);
  const arr: Record<string, unknown>[] = Array.isArray(raw)
    ? (raw as Record<string, unknown>[])
    : Array.isArray(json)
      ? (json as Record<string, unknown>[])
      : [];
  const records = arr.map((r) => mapRecord(r, args.fieldMap));
  let cursorAfter: string | null = null;
  if (args.cursorField) {
    for (const r of records) {
      const v = r[args.cursorField];
      if (v != null && (cursorAfter == null || String(v) > cursorAfter)) cursorAfter = String(v);
    }
  }
  return { records, cursorAfter };
}

export interface PushArgs {
  baseUrl: string; path?: string;
  authHeader?: string; authScheme?: string; token?: string | null;
  records: Record<string, unknown>[];
  fieldMap?: Record<string, string>;
  fetchImpl?: FetchLike;
}
export interface PushResult { sent: number; failed: number }

export async function pushGenericRest(args: PushArgs): Promise<PushResult> {
  const f = (args.fetchImpl ?? (globalThis.fetch as unknown as FetchLike));
  const url = (args.baseUrl ?? '').replace(/\/$/, '') + (args.path ?? '');
  const headers = { 'Content-Type': 'application/json', ...authHeaders(args.authHeader, args.authScheme, args.token) };
  let sent = 0, failed = 0;
  for (const rec of args.records) {
    try {
      const res = await f(url, { method: 'POST', headers, body: JSON.stringify(mapRecord(rec, args.fieldMap)) });
      if (res.ok) sent++; else failed++;
    } catch {
      failed++;
    }
  }
  return { sent, failed };
}
