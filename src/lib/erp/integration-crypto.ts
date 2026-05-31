import 'server-only';
import { createHash } from 'crypto';

/** sha256 of the presented plaintext API key as a Postgres bytea literal
 *  (`\x…`), matching the DB's `digest(plaintext,'sha256')` stored value so
 *  erp_api_key_resolve can compare by equality. Server-only (node crypto). */
export function apiKeyHashLiteral(plaintext: string): string {
  return '\\x' + createHash('sha256').update(plaintext, 'utf8').digest('hex');
}
