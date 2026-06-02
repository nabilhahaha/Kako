import type { ConnectorAdapter, ConnectorConfigField } from './types';
import { missingRequired } from './types';

/** SAP S/4HANA adapter. Two transports on one connectable system:
 *   • `odata` (B3a — S/4HANA Cloud / Gateway): OData v2/v4 via the shared OData
 *     helper; auth OAuth2 (BTP) or Basic (communication user).
 *   • `file`  (B3b — On-Prem / ECC + middleware): CSV/JSON over SFTP, reusing the
 *     B1 csv_sftp runtime with SAP IDoc field presets (DEBMAS/CREMAS/MATMAS in;
 *     ORDERS/INVOIC out). VANTORA reads/writes the SFTP drop only — middleware
 *     bridges IDoc/BAPI ↔ file; we never touch RFC/BAPI directly.
 *  Runtime: connectors/runtime/sap-s4-runtime.ts (odata) + csv-sftp-runtime.ts
 *  (file). Transport defaults to `odata` when unset (back-compat for B3a). */
const FIELDS: ConnectorConfigField[] = [
  {
    key: 'transport', labelEn: 'Transport', labelAr: 'وسيلة النقل', type: 'select',
    options: [
      { value: 'odata', labelEn: 'OData (S/4HANA Cloud / Gateway)', labelAr: 'OData (سحابي / Gateway)' },
      { value: 'file', labelEn: 'File over SFTP (On-Prem / ECC + middleware)', labelAr: 'ملفات عبر SFTP (محلي / ECC + وسيط)' },
    ],
    placeholder: 'odata',
  },
  // ── OData transport ──
  { key: 'base_url', labelEn: 'OData base URL', labelAr: 'الرابط الأساسي لـ OData', type: 'text', placeholder: 'https://<host>/sap/opu/odata/sap' },
  {
    key: 'auth_kind', labelEn: 'Auth (OData)', labelAr: 'المصادقة (OData)', type: 'select',
    options: [
      { value: 'basic', labelEn: 'Basic (communication user)', labelAr: 'أساسية (مستخدم اتصال)' },
      { value: 'oauth2', labelEn: 'OAuth2 (BTP)', labelAr: 'OAuth2 (BTP)' },
    ],
  },
  { key: 'odata_version', labelEn: 'OData version', labelAr: 'إصدار OData', type: 'text', placeholder: 'v2' },
  { key: 'token_url', labelEn: 'Token URL (OAuth2)', labelAr: 'رابط الرمز (OAuth2)', type: 'text' },
  { key: 'client_id', labelEn: 'Client ID (OAuth2)', labelAr: 'معرّف العميل (OAuth2)', type: 'text' },
  { key: 'scope', labelEn: 'Scope (OAuth2)', labelAr: 'النطاق (OAuth2)', type: 'text' },
  // ── File (SFTP) transport ──
  { key: 'host', labelEn: 'SFTP host (file)', labelAr: 'مضيف SFTP (ملفات)', type: 'text', placeholder: 'sftp.example.com' },
  { key: 'port', labelEn: 'Port (file)', labelAr: 'المنفذ (ملفات)', type: 'number', placeholder: '22' },
  { key: 'username', labelEn: 'Username (Basic / SFTP)', labelAr: 'اسم المستخدم (أساسية / SFTP)', type: 'text' },
  { key: 'remote_path', labelEn: 'Remote path (file)', labelAr: 'المسار البعيد (ملفات)', type: 'text', placeholder: '/out/customers.csv' },
  {
    key: 'format', labelEn: 'File format (file)', labelAr: 'صيغة الملف (ملفات)', type: 'select',
    options: [
      { value: 'csv', labelEn: 'CSV', labelAr: 'CSV' },
      { value: 'json', labelEn: 'JSON', labelAr: 'JSON' },
    ],
    placeholder: 'csv',
  },
];

function validateFile(config: Record<string, unknown>): string | null {
  const req = missingRequired(
    FIELDS.filter((f) => ['host', 'username', 'remote_path'].includes(f.key)).map((f) => ({ ...f, required: true })),
    config,
  );
  if (req) return req;
  const fmt = String(config.format ?? '');
  if (fmt && !['csv', 'json'].includes(fmt)) return 'Unsupported file format';
  const port = config.port;
  if (port !== undefined && port !== null && String(port).trim() !== '' && Number.isNaN(Number(port))) {
    return 'Port must be a number';
  }
  return null;
}

function validateOData(config: Record<string, unknown>): string | null {
  const base = missingRequired(
    FIELDS.filter((f) => ['base_url', 'auth_kind'].includes(f.key)).map((f) => ({ ...f, required: true })),
    config,
  );
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
}

export const sapS4Adapter: ConnectorAdapter = {
  key: 'sap_s4',
  kind: 'odata',
  labelEn: 'SAP S/4HANA (OData / On-Prem ECC file)',
  labelAr: 'SAP S/4HANA (OData / ملفات محلي ECC)',
  directions: ['in', 'out', 'both'],
  configFields: FIELDS,
  secretField: { key: 'secret', labelEn: 'Password / client secret / SFTP key', labelAr: 'كلمة المرور / سر العميل / مفتاح SFTP', type: 'password', secret: true },
  validateConfig(config) {
    // Transport defaults to OData when unset (back-compat for B3a connections).
    const transport = String(config.transport ?? 'odata');
    if (transport && !['odata', 'file'].includes(transport)) return 'Transport must be odata or file';
    return transport === 'file' ? validateFile(config) : validateOData(config);
  },
};
