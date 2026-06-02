import type { ConnectorAdapter, ConnectorConfigField } from './types';
import { missingRequired } from './types';

/** CSV/JSON over SFTP adapter — exchanges files with an SFTP server (common for
 *  ERP/accounting feeds). The Sync Engine (2C-2) reads/writes files at
 *  remote_path; 2C-1 registers the adapter, its config schema, and validation. */
const FIELDS: ConnectorConfigField[] = [
  { key: 'host', labelEn: 'SFTP host', labelAr: 'مضيف SFTP', type: 'text', required: true, placeholder: 'sftp.example.com' },
  { key: 'port', labelEn: 'Port', labelAr: 'المنفذ', type: 'number', placeholder: '22' },
  { key: 'username', labelEn: 'Username', labelAr: 'اسم المستخدم', type: 'text', required: true },
  { key: 'remote_path', labelEn: 'Remote path', labelAr: 'المسار البعيد', type: 'text', required: true, placeholder: '/exports/customers.csv' },
  {
    key: 'format', labelEn: 'File format', labelAr: 'صيغة الملف', type: 'select', required: true,
    options: [
      { value: 'csv', labelEn: 'CSV', labelAr: 'CSV' },
      { value: 'json', labelEn: 'JSON', labelAr: 'JSON' },
    ],
  },
];

export const csvSftpAdapter: ConnectorAdapter = {
  key: 'csv_sftp',
  kind: 'file',
  labelEn: 'CSV/JSON over SFTP',
  labelAr: 'CSV/JSON عبر SFTP',
  directions: ['in', 'out', 'both'],
  configFields: FIELDS,
  secretField: { key: 'password', labelEn: 'Password / private key', labelAr: 'كلمة المرور / المفتاح', type: 'password', secret: true },
  validateConfig(config) {
    const req = missingRequired(FIELDS, config);
    if (req) return req;
    const fmt = String(config.format ?? '');
    if (fmt && !['csv', 'json'].includes(fmt)) return 'Unsupported file format';
    const port = config.port;
    if (port !== undefined && port !== null && String(port).trim() !== '' && Number.isNaN(Number(port))) {
      return 'Port must be a number';
    }
    return null;
  },
};
