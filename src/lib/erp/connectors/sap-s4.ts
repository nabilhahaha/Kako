import type { ConnectorAdapter, ConnectorConfigField } from './types';
import { missingRequired } from './types';

/** SAP S/4HANA adapter (B3a — Cloud, OData). OData v2/v4 via the shared OData
 *  helper; auth OAuth2 (BTP) or Basic (communication user). On-prem/ECC file
 *  transport is B3b. Runtime: connectors/runtime/sap-s4-runtime.ts. */
const FIELDS: ConnectorConfigField[] = [
  { key: 'base_url', labelEn: 'OData base URL', labelAr: 'الرابط الأساسي لـ OData', type: 'text', required: true, placeholder: 'https://<host>/sap/opu/odata/sap' },
  {
    key: 'auth_kind', labelEn: 'Auth', labelAr: 'المصادقة', type: 'select', required: true,
    options: [
      { value: 'basic', labelEn: 'Basic (communication user)', labelAr: 'أساسية (مستخدم اتصال)' },
      { value: 'oauth2', labelEn: 'OAuth2 (BTP)', labelAr: 'OAuth2 (BTP)' },
    ],
  },
  { key: 'odata_version', labelEn: 'OData version', labelAr: 'إصدار OData', type: 'text', placeholder: 'v2' },
  { key: 'username', labelEn: 'Username (Basic)', labelAr: 'اسم المستخدم (أساسية)', type: 'text' },
  { key: 'token_url', labelEn: 'Token URL (OAuth2)', labelAr: 'رابط الرمز (OAuth2)', type: 'text' },
  { key: 'client_id', labelEn: 'Client ID (OAuth2)', labelAr: 'معرّف العميل (OAuth2)', type: 'text' },
  { key: 'scope', labelEn: 'Scope (OAuth2)', labelAr: 'النطاق (OAuth2)', type: 'text' },
];

export const sapS4Adapter: ConnectorAdapter = {
  key: 'sap_s4',
  kind: 'odata',
  labelEn: 'SAP S/4HANA (Cloud, OData)',
  labelAr: 'SAP S/4HANA (سحابي، OData)',
  directions: ['in', 'out', 'both'],
  configFields: FIELDS,
  secretField: { key: 'secret', labelEn: 'Password / client secret', labelAr: 'كلمة المرور / سر العميل', type: 'password', secret: true },
  validateConfig(config) {
    const base = missingRequired(FIELDS.filter((f) => ['base_url', 'auth_kind'].includes(f.key)), config);
    if (base) return base;
    const auth = String(config.auth_kind ?? '');
    if (auth === 'basic' && !String(config.username ?? '').trim()) return 'Username is required for Basic auth';
    if (auth === 'oauth2') {
      if (!String(config.token_url ?? '').trim()) return 'Token URL is required for OAuth2';
      if (!String(config.client_id ?? '').trim()) return 'Client ID is required for OAuth2';
    }
    const v = String(config.odata_version ?? '');
    if (v && !['v2', 'v4'].includes(v)) return 'OData version must be v2 or v4';
    return null;
  },
};
