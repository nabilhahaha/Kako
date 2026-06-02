import type { ConnectorAdapter, ConnectorConfigField } from './types';
import { missingRequired } from './types';

/** Generic REST adapter — talks to any HTTPS JSON REST API. The Sync Engine
 *  (2C-2) uses base_url + records_path to pull and base_url to push, with the
 *  Vault-stored bearer token in the auth header. */
const FIELDS: ConnectorConfigField[] = [
  { key: 'base_url', labelEn: 'Base URL', labelAr: 'الرابط الأساسي', type: 'text', required: true, placeholder: 'https://api.example.com/v1' },
  { key: 'auth_header', labelEn: 'Auth header', labelAr: 'ترويسة المصادقة', type: 'text', placeholder: 'Authorization' },
  { key: 'auth_scheme', labelEn: 'Auth scheme', labelAr: 'نوع المصادقة', type: 'text', placeholder: 'Bearer' },
  { key: 'records_path', labelEn: 'Records path (JSON)', labelAr: 'مسار السجلات (JSON)', type: 'text', placeholder: 'data' },
];

export const genericRestAdapter: ConnectorAdapter = {
  key: 'generic_rest',
  kind: 'rest',
  labelEn: 'Generic REST API',
  labelAr: 'واجهة REST عامة',
  directions: ['in', 'out', 'both'],
  configFields: FIELDS,
  secretField: { key: 'token', labelEn: 'API token', labelAr: 'رمز API', type: 'password', secret: true },
  validateConfig(config) {
    const req = missingRequired(FIELDS, config);
    if (req) return req;
    const base = String(config.base_url ?? '').trim();
    if (!/^https:\/\//i.test(base)) return 'Base URL must be https';
    return null;
  },
};
