/** ── Connector Framework — types (Phase 2C-1) ──────────────────────────────
 *  Entity-based, reusable. An adapter describes how a connection talks to one
 *  external system family. NON-secret config fields are collected by the UI and
 *  stored in erp_integrations.config; the single secret goes to Supabase Vault.
 *  Live pull/push transport is implemented by the Sync Engine (2C-2) on top of
 *  this interface — 2C-1 establishes the framework, registry, config schemas,
 *  validation, and field↔entity mapping. Pure/client-safe (no node/DB deps). */

export type ConnectorKind = 'rest' | 'odata' | 'file';
export type ConnectorDirection = 'in' | 'out' | 'both';

export interface ConnectorConfigField {
  key: string;
  labelEn: string;
  labelAr: string;
  type: 'text' | 'number' | 'select' | 'password';
  required?: boolean;
  options?: { value: string; labelEn: string; labelAr: string }[];
  placeholder?: string;
  /** True for the single sensitive value stored in Vault (not in config jsonb). */
  secret?: boolean;
}

export interface ConnectorAdapter {
  key: string;                 // 'generic_rest' | 'csv_sftp' | future
  kind: ConnectorKind;
  labelEn: string;
  labelAr: string;
  directions: ConnectorDirection[];
  /** Non-secret config fields the UI collects (stored in config jsonb). */
  configFields: ConnectorConfigField[];
  /** The single secret field stored in Vault (optional for public endpoints). */
  secretField?: ConnectorConfigField;
  /** Validate the collected config; return an error message or null when valid. */
  validateConfig: (config: Record<string, unknown>) => string | null;
}

/** Helper: required-field presence check shared by adapters. */
export function missingRequired(
  fields: ConnectorConfigField[],
  config: Record<string, unknown>,
): string | null {
  for (const f of fields) {
    if (!f.required) continue;
    const v = config[f.key];
    if (v === undefined || v === null || String(v).trim() === '') {
      return `${f.labelEn} is required`;
    }
  }
  return null;
}
