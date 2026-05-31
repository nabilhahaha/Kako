import { mapRecord } from './generic-rest-runtime';

/** ── Shared OData runtime helper (platform infrastructure) ──────────────────
 *  Generic OData pull/push used by vendor adapters (Dynamics BC v4, SAP S/4HANA
 *  v2/v4, future OData vendors). Auth-agnostic (caller supplies headers — bearer
 *  or basic), version-aware for the response shape (v4 `value` vs v2 `d.results`),
 *  with delta `$filter`, `$orderby`, and `$top`. Pure + injectable fetch. */

type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) =>
  Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> }>;

export type ODataVersion = 'v2' | 'v4';

/** Extract the record array from an OData response by version. */
export function odataRecords(json: unknown, version: ODataVersion): Record<string, unknown>[] {
  if (version === 'v2') {
    const d = (json as { d?: unknown })?.d;
    const results = (d as { results?: unknown })?.results;
    if (Array.isArray(results)) return results as Record<string, unknown>[];
    if (Array.isArray(d)) return d as Record<string, unknown>[];
    return [];
  }
  const value = (json as { value?: unknown })?.value;
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

export interface ODataPullArgs {
  collectionUrl: string;                 // base + '/' + entity set/path
  authHeaders: Record<string, string>;   // e.g. { Authorization: 'Bearer …' | 'Basic …' }
  version?: ODataVersion;                 // default v4
  cursor?: string | null;
  cursorField?: string;
  top?: number;
  fieldMap?: Record<string, string>;
  label?: string;                         // for error messages (vendor key)
  fetchImpl?: FetchLike;
}
export interface ODataResult { records: Record<string, unknown>[]; cursorAfter: string | null }

export async function odataPull(args: ODataPullArgs): Promise<ODataResult> {
  const f = (args.fetchImpl ?? (globalThis.fetch as unknown as FetchLike));
  const version = args.version ?? 'v4';
  const cursorField = args.cursorField ?? (version === 'v2' ? 'LastChangeDateTime' : 'lastModifiedDateTime');
  const params: string[] = [`$top=${args.top ?? 100}`, `$orderby=${encodeURIComponent(cursorField)}`];
  if (args.cursor) params.push(`$filter=${encodeURIComponent(`${cursorField} gt ${args.cursor}`)}`);
  const url = `${args.collectionUrl}?${params.join('&')}`;
  const res = await f(url, { method: 'GET', headers: { Accept: 'application/json', ...args.authHeaders } });
  if (res.status === 429) throw new Error(`${args.label ?? 'odata'} throttled (HTTP 429)`);
  if (!res.ok) throw new Error(`${args.label ?? 'odata'} pull failed: HTTP ${res.status}`);
  const records = odataRecords(await res.json(), version).map((r) => mapRecord(r, args.fieldMap));
  let cursorAfter: string | null = null;
  for (const r of records) {
    const v = r[cursorField];
    if (v != null && (cursorAfter == null || String(v) > cursorAfter)) cursorAfter = String(v);
  }
  return { records, cursorAfter };
}

export interface ODataPushArgs {
  collectionUrl: string;
  authHeaders: Record<string, string>;
  records: Record<string, unknown>[];
  fieldMap?: Record<string, string>;
  fetchImpl?: FetchLike;
}

export async function odataPush(args: ODataPushArgs): Promise<{ sent: number; failed: number }> {
  const f = (args.fetchImpl ?? (globalThis.fetch as unknown as FetchLike));
  const headers = { 'Content-Type': 'application/json', ...args.authHeaders };
  let sent = 0, failed = 0;
  for (const rec of args.records) {
    try {
      const res = await f(args.collectionUrl, { method: 'POST', headers, body: JSON.stringify(mapRecord(rec, args.fieldMap)) });
      if (res.ok) sent++; else failed++;
    } catch {
      failed++;
    }
  }
  return { sent, failed };
}
