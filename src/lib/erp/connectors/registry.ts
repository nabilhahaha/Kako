import type { ConnectorAdapter } from './types';
import { genericRestAdapter } from './generic-rest';
import { csvSftpAdapter } from './csv-sftp';
import { dynamicsBcAdapter } from './dynamics-bc';

/** ── Connector registry ────────────────────────────────────────────────────
 *  Single source of truth for the adapters a company can connect. Adding a new
 *  system (e.g. SAP/Oracle/Odoo) = register its descriptor here; no new screens
 *  or migration. Reference adapters (generic_rest, csv_sftp) prove the framework;
 *  dynamics_bc is the first vendor adapter (B2). */
const ADAPTERS: ConnectorAdapter[] = [genericRestAdapter, csvSftpAdapter, dynamicsBcAdapter];
const BY_KEY = new Map(ADAPTERS.map((a) => [a.key, a]));

export function listConnectorAdapters(): ConnectorAdapter[] {
  return ADAPTERS;
}
export function getConnectorAdapter(key: string): ConnectorAdapter | undefined {
  return BY_KEY.get(key);
}
export function isKnownAdapter(key: string): boolean {
  return BY_KEY.has(key);
}

/** Validate a connection's adapter + config together (used by the server action
 *  before persisting). Returns an error message or null when valid. */
export function validateConnection(adapterKey: string, config: Record<string, unknown>): string | null {
  const adapter = getConnectorAdapter(adapterKey);
  if (!adapter) return 'Unknown adapter';
  return adapter.validateConfig(config);
}

export type { ConnectorAdapter, ConnectorConfigField, ConnectorKind, ConnectorDirection } from './types';
