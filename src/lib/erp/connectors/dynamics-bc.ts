import type { ConnectorAdapter, ConnectorConfigField } from './types';
import { missingRequired } from './types';

/** Dynamics 365 Business Central (SaaS) adapter — OData v4 + Azure AD OAuth2
 *  client-credentials. Runtime: connectors/runtime/dynamics-bc-runtime.ts.
 *  First entity set: customer / product / supplier (in), then order / invoice
 *  (out). Both directions; per-entity sync jobs decide ownership. */
const FIELDS: ConnectorConfigField[] = [
  { key: 'tenant_id', labelEn: 'Azure AD tenant ID', labelAr: 'معرّف مستأجر Azure AD', type: 'text', required: true },
  { key: 'client_id', labelEn: 'Client (app) ID', labelAr: 'معرّف التطبيق', type: 'text', required: true },
  { key: 'environment', labelEn: 'BC environment', labelAr: 'بيئة BC', type: 'text', required: true, placeholder: 'production' },
  { key: 'company_id', labelEn: 'BC company ID (GUID)', labelAr: 'معرّف شركة BC', type: 'text', required: true },
  { key: 'api_version', labelEn: 'API version', labelAr: 'إصدار API', type: 'text', placeholder: 'v2.0' },
];

export const dynamicsBcAdapter: ConnectorAdapter = {
  key: 'dynamics_bc',
  kind: 'odata',
  labelEn: 'Dynamics 365 Business Central',
  labelAr: 'Dynamics 365 Business Central',
  directions: ['in', 'out', 'both'],
  configFields: FIELDS,
  secretField: { key: 'client_secret', labelEn: 'Client secret', labelAr: 'سر التطبيق', type: 'password', secret: true },
  validateConfig(config) {
    const req = missingRequired(FIELDS, config);
    if (req) return req;
    return null;
  },
};
