import { mapRecord } from './generic-rest-runtime';
import { signOauth1 } from './oauth1';

/** ── Oracle NetSuite runtime (B4) ───────────────────────────────────────────
 *  SuiteTalk REST record-API pull/push with Token-Based Auth (OAuth 1.0a
 *  HMAC-SHA256), used by the sync dispatcher. Pure functions with injectable
 *  fetch (and injectable nonce/timestamp via the signer) so they're unit-
 *  testable. Both directions. SuiteQL is a documented follow-up; first cut uses
 *  the record API for symmetry with the other adapters. */

type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) =>
  Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> }>;

export interface NetSuiteConfig {
  accountId: string;       // realm + host segment
  consumerKey: string;
  tokenId: string;
}

/** VANTORA entity → NetSuite record type (default presets; overridable per job). */
const RECORD_TYPE: Record<string, string> = {
  customer: 'customer',
  supplier: 'vendor',
  product: 'inventoryItem',
  order: 'salesOrder',
  invoice: 'invoice',
};
export function netsuiteRecordType(entity: string): string | undefined {
  return RECORD_TYPE[entity];
}

export function netsuiteBaseUrl(accountId: string): string {
  // NetSuite account ids use '_' in the host (e.g. 123456_SB1 → 123456-sb1).
  const host = accountId.toLowerCase().replace(/_/g, '-');
  return `https://${host}.suitetalk.api.netsuite.com/services/rest`;
}

/** Split the single Vault secret packed as `consumer_secret:token_secret`. */
export function splitNetsuiteSecret(secret: string | null | undefined): { consumerSecret: string; tokenSecret: string } {
  const raw = secret ?? '';
  const idx = raw.indexOf(':');
  if (idx === -1) return { consumerSecret: raw, tokenSecret: '' };
  return { consumerSecret: raw.slice(0, idx), tokenSecret: raw.slice(idx + 1) };
}

interface AuthArgs { cfg: NetSuiteConfig; secret: string; nonce?: string; timestamp?: string }

function authHeader(method: string, url: string, a: AuthArgs): string {
  const { consumerSecret, tokenSecret } = splitNetsuiteSecret(a.secret);
  return signOauth1({
    method, url,
    consumerKey: a.cfg.consumerKey, consumerSecret,
    tokenId: a.cfg.tokenId, tokenSecret,
    realm: a.cfg.accountId, nonce: a.nonce, timestamp: a.timestamp,
  }).header;
}

export interface NsPullArgs {
  cfg: NetSuiteConfig; recordType: string; secret: string;
  cursor?: string | null; cursorField?: string; // default lastModifiedDate
  limit?: number; fieldMap?: Record<string, string>;
  fetchImpl?: FetchLike; nonce?: string; timestamp?: string;
}

const MAX_PAGES = 50;

export async function pullNetSuite(args: NsPullArgs): Promise<{ records: Record<string, unknown>[]; cursorAfter: string | null }> {
  const f = (args.fetchImpl ?? (globalThis.fetch as unknown as FetchLike));
  const cursorField = args.cursorField && args.cursorField.trim() ? args.cursorField.trim() : 'lastModifiedDate';
  const limit = args.limit && args.limit > 0 ? args.limit : 100;
  const collection = `${netsuiteBaseUrl(args.cfg.accountId)}/record/v1/${args.recordType}`;

  const all: Record<string, unknown>[] = [];
  let offset = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const params: string[] = [`limit=${limit}`, `offset=${offset}`];
    if (args.cursor) params.push(`q=${encodeURIComponent(`${cursorField} AFTER "${args.cursor}"`)}`);
    const url = `${collection}?${params.join('&')}`;
    const res = await f(url, { method: 'GET', headers: { Accept: 'application/json', Authorization: authHeader('GET', url, args) } });
    if (res.status === 429) throw new Error('netsuite throttled (HTTP 429)');
    if (!res.ok) throw new Error(`netsuite pull failed: HTTP ${res.status}`);
    const json = (await res.json()) as { items?: unknown; hasMore?: boolean };
    const items = Array.isArray(json.items) ? (json.items as Record<string, unknown>[]) : [];
    all.push(...items);
    if (!json.hasMore && items.length < limit) break;
    if (items.length === 0) break;
    offset += limit;
  }

  let cursorAfter: string | null = args.cursor ?? null;
  for (const r of all) {
    const v = r[cursorField];
    if (v != null && (cursorAfter == null || String(v) > cursorAfter)) cursorAfter = String(v);
  }
  const records = all.map((r) => mapRecord(r, args.fieldMap));
  return { records, cursorAfter };
}

export interface NsPushArgs {
  cfg: NetSuiteConfig; recordType: string; secret: string;
  records: Record<string, unknown>[]; fieldMap?: Record<string, string>;
  fetchImpl?: FetchLike; nonce?: string; timestamp?: string;
}

export async function pushNetSuite(args: NsPushArgs): Promise<{ sent: number; failed: number }> {
  const f = (args.fetchImpl ?? (globalThis.fetch as unknown as FetchLike));
  const url = `${netsuiteBaseUrl(args.cfg.accountId)}/record/v1/${args.recordType}`;
  let sent = 0, failed = 0;
  for (const rec of args.records) {
    try {
      const body = JSON.stringify(mapRecord(rec, args.fieldMap));
      const res = await f(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: authHeader('POST', url, args) },
        body,
      });
      if (res.ok) sent++; else failed++;
    } catch {
      failed++;
    }
  }
  return { sent, failed };
}
