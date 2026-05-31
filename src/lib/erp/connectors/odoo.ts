import type { ConnectorAdapter, ConnectorConfigField } from './types';
import { missingRequired } from './types';

/** Odoo adapter (B5) — JSON-RPC (POST /jsonrpc). Auth: API key (v14+) primary,
 *  username/password fallback (the single Vault secret is the key/password; the
 *  database name + login are non-secret config). Works across Odoo Online /
 *  Odoo.sh / on-prem (v16/17/18) — same JSON-RPC API. Runtime:
 *  connectors/runtime/odoo-runtime.ts; model/field presets: odoo-presets.ts. */
const FIELDS: ConnectorConfigField[] = [
  { key: 'base_url', labelEn: 'Odoo URL', labelAr: 'رابط أودو', type: 'text', required: true, placeholder: 'https://mycompany.odoo.com' },
  { key: 'database', labelEn: 'Database name', labelAr: 'اسم قاعدة البيانات', type: 'text', required: true, placeholder: 'mycompany' },
  { key: 'username', labelEn: 'Login (user/email)', labelAr: 'اسم الدخول (مستخدم/بريد)', type: 'text', required: true },
];

export const odooAdapter: ConnectorAdapter = {
  key: 'odoo',
  kind: 'rest',
  labelEn: 'Odoo (JSON-RPC)',
  labelAr: 'أودو (JSON-RPC)',
  directions: ['in', 'out', 'both'],
  configFields: FIELDS,
  secretField: { key: 'secret', labelEn: 'API key / password', labelAr: 'مفتاح API / كلمة المرور', type: 'password', secret: true },
  validateConfig(config) {
    const req = missingRequired(FIELDS, config);
    if (req) return req;
    const base = String(config.base_url ?? '');
    if (base && !/^https?:\/\//i.test(base)) return 'Odoo URL must start with http(s)://';
    return null;
  },
};
