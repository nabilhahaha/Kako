import { fetchClientCredentialsToken } from './oauth2';
import { mapRecord } from './generic-rest-runtime';

/** ── Dynamics 365 Business Central runtime (B2) ─────────────────────────────
 *  OAuth2 (Azure AD client-credentials) + OData v4 pull/push, used by the sync
 *  dispatcher. Pure functions with injectable fetch (unit-testable; no native
 *  dep). SaaS BC only in B2. Both directions supported. */

type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) =>
  Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> }>;

export interface BcConfig {
  tenantId: string;
  clientId: string;
  environment: string;   // e.g. 'production'
  companyId: string;     // BC company GUID
  apiVersion?: string;   // default 'v2.0'
}

const SCOPE = 'https://api.businesscentral.dynamics.com/.default';
const tokenUrl = (tenantId: string) => `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
export function bcBaseUrl(cfg: BcConfig): string {
  return `https://api.businesscentral.dynamics.com/v2.0/${cfg.tenantId}/${cfg.environment}/api/${cfg.apiVersion ?? 'v2.0'}/companies(${cfg.companyId})`;
}

/** VANTORA entity → BC OData entity set (default presets; overridable per job). */
const ENTITY_SET: Record<string, string> = {
  customer: 'customers',
  supplier: 'vendors',
  product: 'items',
  order: 'salesOrders',
  invoice: 'salesInvoices',
};
export function bcEntitySet(entity: string): string | undefined {
  return ENTITY_SET[entity];
}

async function bcToken(cfg: BcConfig, clientSecret: string, fetchImpl?: FetchLike): Promise<string> {
  const { accessToken } = await fetchClientCredentialsToken({
    tokenUrl: tokenUrl(cfg.tenantId), clientId: cfg.clientId, clientSecret, scope: SCOPE, fetchImpl,
  });
  return accessToken;
}

export interface BcPullArgs {
  cfg: BcConfig; entitySet: string; clientSecret: string;
  cursor?: string | null; cursorField?: string; top?: number;
  fieldMap?: Record<string, string>; fetchImpl?: FetchLike;
}
export interface BcPullResult { records: Record<string, unknown>[]; cursorAfter: string | null }

export async function pullDynamicsBc(args: BcPullArgs): Promise<BcPullResult> {
  const f = (args.fetchImpl ?? (globalThis.fetch as unknown as FetchLike));
  const token = await bcToken(args.cfg, args.clientSecret, f);
  const cursorField = args.cursorField ?? 'lastModifiedDateTime';
  const params: string[] = [`$top=${args.top ?? 100}`, `$orderby=${encodeURIComponent(cursorField)}`];
  if (args.cursor) params.push(`$filter=${encodeURIComponent(`${cursorField} gt ${args.cursor}`)}`);
  const url = `${bcBaseUrl(args.cfg)}/${args.entitySet}?${params.join('&')}`;
  const res = await f(url, { method: 'GET', headers: { Accept: 'application/json', Authorization: `Bearer ${token}` } });
  if (res.status === 429) throw new Error('dynamics_bc throttled (HTTP 429)');
  if (!res.ok) throw new Error(`dynamics_bc pull failed: HTTP ${res.status}`);
  const json = (await res.json()) as { value?: Record<string, unknown>[] };
  const arr = Array.isArray(json.value) ? json.value : [];
  const records = arr.map((r) => mapRecord(r, args.fieldMap));
  let cursorAfter: string | null = null;
  for (const r of records) {
    const v = r[cursorField];
    if (v != null && (cursorAfter == null || String(v) > cursorAfter)) cursorAfter = String(v);
  }
  return { records, cursorAfter };
}

export interface BcPushArgs {
  cfg: BcConfig; entitySet: string; clientSecret: string;
  records: Record<string, unknown>[]; fieldMap?: Record<string, string>; fetchImpl?: FetchLike;
}
export interface BcPushResult { sent: number; failed: number }

export async function pushDynamicsBc(args: BcPushArgs): Promise<BcPushResult> {
  const f = (args.fetchImpl ?? (globalThis.fetch as unknown as FetchLike));
  const token = await bcToken(args.cfg, args.clientSecret, f);
  const url = `${bcBaseUrl(args.cfg)}/${args.entitySet}`;
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
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
