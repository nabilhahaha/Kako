import { fetchClientCredentialsToken } from './oauth2';
import { odataPull, odataPush, type ODataVersion } from './odata';

/** ── SAP S/4HANA runtime (B3a — Cloud, OData) ───────────────────────────────
 *  OData (v2 default, v4 optional) pull/push via the shared OData helper. Auth:
 *  OAuth2 (BTP client-credentials) or Basic (communication user). SaaS S/4HANA in
 *  B3a; on-prem/ECC file transport is B3b (reuses csv_sftp). Both directions.
 *  Pure + injectable fetch (unit-testable). */

type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) =>
  Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> }>;

export interface SapConfig {
  baseUrl: string;                 // e.g. https://my.s4hana.ondemand.com/sap/opu/odata/sap
  auth: 'oauth2' | 'basic';
  odataVersion?: ODataVersion;     // default 'v2'
  // oauth2:
  tokenUrl?: string; clientId?: string; scope?: string;
  // basic:
  username?: string;
}

/** VANTORA entity → SAP OData service/collection path (presets; overridable). */
const ENTITY_PATH: Record<string, string> = {
  customer: 'API_BUSINESS_PARTNER/A_BusinessPartner',
  supplier: 'API_BUSINESS_PARTNER/A_BusinessPartner',
  product: 'API_PRODUCT_SRV/A_Product',
  order: 'API_SALES_ORDER_SRV/A_SalesOrder',
  invoice: 'API_BILLING_DOCUMENT_SRV/A_BillingDocument',
};
export function sapEntityPath(entity: string): string | undefined {
  return ENTITY_PATH[entity];
}

function collectionUrl(cfg: SapConfig, path: string): string {
  return `${cfg.baseUrl.replace(/\/$/, '')}/${path}`;
}

/** Build auth headers — Bearer (OAuth2) or Basic (communication user). */
export async function sapAuthHeaders(cfg: SapConfig, secret: string, fetchImpl?: FetchLike): Promise<Record<string, string>> {
  if (cfg.auth === 'basic') {
    const token = Buffer.from(`${cfg.username ?? ''}:${secret}`).toString('base64');
    return { Authorization: `Basic ${token}` };
  }
  const { accessToken } = await fetchClientCredentialsToken({
    tokenUrl: cfg.tokenUrl ?? '', clientId: cfg.clientId ?? '', clientSecret: secret, scope: cfg.scope ?? '', fetchImpl,
  });
  return { Authorization: `Bearer ${accessToken}` };
}

export interface SapPullArgs {
  cfg: SapConfig; path: string; secret: string;
  cursor?: string | null; cursorField?: string; top?: number;
  fieldMap?: Record<string, string>; fetchImpl?: FetchLike;
}

export async function pullSapS4(args: SapPullArgs) {
  const authHeaders = await sapAuthHeaders(args.cfg, args.secret, args.fetchImpl);
  return odataPull({
    collectionUrl: collectionUrl(args.cfg, args.path),
    authHeaders,
    version: args.cfg.odataVersion ?? 'v2',
    cursor: args.cursor,
    cursorField: args.cursorField,
    top: args.top,
    fieldMap: args.fieldMap,
    label: 'sap_s4',
    fetchImpl: args.fetchImpl,
  });
}

export interface SapPushArgs {
  cfg: SapConfig; path: string; secret: string;
  records: Record<string, unknown>[]; fieldMap?: Record<string, string>; fetchImpl?: FetchLike;
}

export async function pushSapS4(args: SapPushArgs) {
  const authHeaders = await sapAuthHeaders(args.cfg, args.secret, args.fetchImpl);
  return odataPush({
    collectionUrl: collectionUrl(args.cfg, args.path),
    authHeaders,
    records: args.records,
    fieldMap: args.fieldMap,
    fetchImpl: args.fetchImpl,
  });
}
