// ── Egyptian Tax Authority (ETA) e-invoicing — environment & endpoints ──
// All values come from env; the integration is a no-op until credentials are
// provided. See docs/ETA.md for how to obtain them.

export type EtaEnvironment = 'preprod' | 'production';

const ENV = (process.env.ETA_ENVIRONMENT as EtaEnvironment) || 'preprod';

/** ETA identity + API base URLs per environment. Verify against the current
 *  ETA SDK (https://sdk.invoicing.eta.gov.eg) before go-live. */
const ENDPOINTS: Record<EtaEnvironment, { id: string; api: string }> = {
  preprod: {
    id: 'https://id.preprod.eta.gov.eg',
    api: 'https://api.preprod.invoicing.eta.gov.eg/api/v1',
  },
  production: {
    id: 'https://id.eta.gov.eg',
    api: 'https://api.invoicing.eta.gov.eg/api/v1',
  },
};

export const etaConfig = {
  environment: ENV,
  clientId: process.env.ETA_CLIENT_ID ?? '',
  clientSecret: process.env.ETA_CLIENT_SECRET ?? '',
  endpoints: ENDPOINTS[ENV],
  /** ETA document schema version (the doc shape may change between versions). */
  documentTypeVersion: process.env.ETA_DOCUMENT_TYPE_VERSION ?? '1.0',
};

/** True only when client credentials are present. Callers must short-circuit
 *  to a clean no-op when this is false, so builds/tests never hit ETA. */
export function isEtaConfigured(): boolean {
  return Boolean(etaConfig.clientId && etaConfig.clientSecret);
}
