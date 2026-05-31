import type { ConnectorAdapter, ConnectorConfigField } from './types';
import { missingRequired } from './types';

/** Oracle NetSuite adapter (B4) — SuiteTalk REST record API + Token-Based Auth
 *  (OAuth 1.0a HMAC-SHA256). Non-secret config = account id + consumer key +
 *  token id; the single Vault secret packs `consumer_secret:token_secret` (split
 *  by the runtime). Runtime: connectors/runtime/netsuite-runtime.ts; record-type
 *  / field presets: netsuite-presets.ts. First entities: customer / vendor /
 *  inventoryItem (in), salesOrder / invoice (out). SuiteQL + stock balances are
 *  follow-ups. */
const FIELDS: ConnectorConfigField[] = [
  { key: 'account_id', labelEn: 'Account ID', labelAr: 'معرّف الحساب', type: 'text', required: true, placeholder: '1234567_SB1' },
  { key: 'consumer_key', labelEn: 'Consumer key', labelAr: 'مفتاح المستهلك', type: 'text', required: true },
  { key: 'token_id', labelEn: 'Token ID', labelAr: 'معرّف الرمز', type: 'text', required: true },
];

export const netsuiteAdapter: ConnectorAdapter = {
  key: 'netsuite',
  kind: 'rest',
  labelEn: 'Oracle NetSuite (SuiteTalk REST)',
  labelAr: 'أوراكل نت سويت (SuiteTalk REST)',
  directions: ['in', 'out', 'both'],
  configFields: FIELDS,
  // One Vault secret packs both TBA secrets as `consumer_secret:token_secret`.
  secretField: { key: 'secret', labelEn: 'Consumer secret : Token secret', labelAr: 'سر المستهلك : سر الرمز', type: 'password', secret: true },
  validateConfig(config) {
    const req = missingRequired(FIELDS, config);
    if (req) return req;
    return null;
  },
};
