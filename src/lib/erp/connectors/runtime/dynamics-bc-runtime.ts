import { fetchClientCredentialsToken } from './oauth2';
import { odataPull, odataPush } from './odata';

/** ── Dynamics 365 Business Central runtime (B2) ─────────────────────────────
 *  OAuth2 (Azure AD client-credentials) + OData v4 pull/push (via the shared
 *  OData helper), used by the sync dispatcher. Pure functions with injectable
 *  fetch (unit-testable; no native dep). SaaS BC only. Both directions. */

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
  const token = await bcToken(args.cfg, args.clientSecret, args.fetchImpl);
  return odataPull({
    collectionUrl: `${bcBaseUrl(args.cfg)}/${args.entitySet}`,
    authHeaders: { Authorization: `Bearer ${token}` },
    version: 'v4',
    cursor: args.cursor,
    cursorField: args.cursorField ?? 'lastModifiedDateTime',
    top: args.top,
    fieldMap: args.fieldMap,
    label: 'dynamics_bc',
    fetchImpl: args.fetchImpl,
  });
}

export interface BcPushArgs {
  cfg: BcConfig; entitySet: string; clientSecret: string;
  records: Record<string, unknown>[]; fieldMap?: Record<string, string>; fetchImpl?: FetchLike;
}
export interface BcPushResult { sent: number; failed: number }

export async function pushDynamicsBc(args: BcPushArgs): Promise<BcPushResult> {
  const token = await bcToken(args.cfg, args.clientSecret, args.fetchImpl);
  return odataPush({
    collectionUrl: `${bcBaseUrl(args.cfg)}/${args.entitySet}`,
    authHeaders: { Authorization: `Bearer ${token}` },
    records: args.records,
    fieldMap: args.fieldMap,
    fetchImpl: args.fetchImpl,
  });
}
