import { mapRecord } from './generic-rest-runtime';

/** ── Odoo JSON-RPC runtime (B5) ─────────────────────────────────────────────
 *  Node-side pull/push transport for the `odoo` adapter, used by the sync
 *  dispatcher. Odoo's external API is JSON-RPC (POST /jsonrpc): authenticate to
 *  get a uid, then call model methods via `object.execute_kw`. Pull uses
 *  `search_read` with a domain (delta via `write_date > cursor`) + limit/offset
 *  paging; push uses `create`. Pure functions with an injectable fetch so they're
 *  unit-testable (no DB/session deps). The single Vault secret is the Odoo API
 *  key (v14+) or password. */

type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) =>
  Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> }>;

export interface OdooConfig {
  baseUrl: string;
  database: string;
  username: string; // Odoo login
}

/** VANTORA entity → default Odoo model (customer + supplier both = res.partner;
 *  the per-entity domain in the presets distinguishes them). */
const ODOO_MODELS: Record<string, string> = {
  customer: 'res.partner',
  supplier: 'res.partner',
  product: 'product.template',
  order: 'sale.order',
  invoice: 'account.move',
};

export function odooModel(entity: string): string | undefined {
  return ODOO_MODELS[entity];
}

interface JsonRpcError { data?: { message?: string }; message?: string }

async function jsonRpc(
  f: FetchLike, baseUrl: string, service: string, method: string, args: unknown[],
): Promise<unknown> {
  const url = (baseUrl ?? '').replace(/\/$/, '') + '/jsonrpc';
  const res = await f(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service, method, args } }),
  });
  if (!res.ok) throw new Error(`Odoo HTTP ${res.status}`);
  const json = (await res.json()) as { result?: unknown; error?: JsonRpcError };
  if (json.error) throw new Error(`Odoo error: ${json.error.data?.message ?? json.error.message ?? 'unknown'}`);
  return json.result;
}

/** Resolve the uid via common.authenticate(db, login, key). */
async function authenticate(f: FetchLike, cfg: OdooConfig, secret: string): Promise<number> {
  const uid = await jsonRpc(f, cfg.baseUrl, 'common', 'authenticate', [cfg.database, cfg.username, secret, {}]);
  if (typeof uid !== 'number' || !uid) throw new Error('Odoo authentication failed');
  return uid;
}

export interface OdooPullArgs {
  cfg: OdooConfig; model: string; secret: string;
  cursor?: string | null; cursorField?: string; // default write_date
  fields?: string[]; domain?: unknown[]; limit?: number;
  fieldMap?: Record<string, string>; fetchImpl?: FetchLike;
}

const MAX_PAGES = 50;

export async function pullOdoo(args: OdooPullArgs): Promise<{ records: Record<string, unknown>[]; cursorAfter: string | null }> {
  const f = (args.fetchImpl ?? (globalThis.fetch as unknown as FetchLike));
  const uid = await authenticate(f, args.cfg, args.secret);
  const cursorField = args.cursorField && args.cursorField.trim() ? args.cursorField.trim() : 'write_date';
  const limit = args.limit && args.limit > 0 ? args.limit : 100;

  const domain: unknown[] = [...(args.domain ?? [])];
  if (args.cursor) domain.push([cursorField, '>', args.cursor]);

  const kwargs: Record<string, unknown> = { limit, order: `${cursorField} asc` };
  if (args.fields && args.fields.length) {
    // ensure the cursor field is fetched so we can advance the watermark.
    kwargs.fields = args.fields.includes(cursorField) ? args.fields : [...args.fields, cursorField];
  }

  const all: Record<string, unknown>[] = [];
  let offset = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await jsonRpc(f, args.cfg.baseUrl, 'object', 'execute_kw', [
      args.cfg.database, uid, args.secret, args.model, 'search_read', [domain], { ...kwargs, offset },
    ]);
    const arr = Array.isArray(result) ? (result as Record<string, unknown>[]) : [];
    all.push(...arr);
    if (arr.length < limit) break;
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

export interface OdooPushArgs {
  cfg: OdooConfig; model: string; secret: string;
  records: Record<string, unknown>[]; fieldMap?: Record<string, string>;
  fetchImpl?: FetchLike;
}

export async function pushOdoo(args: OdooPushArgs): Promise<{ sent: number; failed: number }> {
  const f = (args.fetchImpl ?? (globalThis.fetch as unknown as FetchLike));
  const uid = await authenticate(f, args.cfg, args.secret);
  let sent = 0, failed = 0;
  for (const rec of args.records) {
    try {
      const vals = mapRecord(rec, args.fieldMap);
      const result = await jsonRpc(f, args.cfg.baseUrl, 'object', 'execute_kw', [
        args.cfg.database, uid, args.secret, args.model, 'create', [vals],
      ]);
      if (typeof result === 'number' && result) sent++; else failed++;
    } catch {
      failed++;
    }
  }
  return { sent, failed };
}
