// Universal Change Request engine — registry & metadata accessors. PURE module
// (no I/O): parses DB metadata into typed config, holds the apply allowlist, and
// hosts the small CODE registries (named validators, external approval adapters)
// for the cases metadata can't express as data. The DB remains canonical; this
// layer gives type safety + the extension seams packs register into.

import type {
  ChangeRequestEntity,
  ChangeRequestEntityRow,
  ValidationSpec,
  NamedValidator,
  ApprovalAdapter,
} from './types';

// ── Apply allowlist ─────────────────────────────────────────────────────────
// The ONLY tables the Change Request engine may write to when applying an
// approved request. Mirrors the workflow update_record allowlist; a registered
// entity's target_table is validated against this at registration AND at apply,
// so metadata can never point the engine at an arbitrary table. Grows by an
// explicit one-line addition as each master-data entity is governed.
export const CR_APPLY_ALLOWLIST: ReadonlySet<string> = new Set<string>([
  'erp_customers',          // reference entity (registered in Phase 2)
]);

/** Is `table` an allowed Change Request apply target? */
export function isApplyAllowed(table: string): boolean {
  return CR_APPLY_ALLOWLIST.has(table);
}

/** The default workflow definition key for an entity when metadata leaves it blank. */
export function resolveWorkflowKey(entityKey: string, explicit: string | null | undefined): string {
  const k = (explicit ?? '').trim();
  return k || `change_request:${entityKey}`;
}

// ── Metadata parsing (DB row → typed config) ────────────────────────────────
function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function asValidationSpec(v: unknown): ValidationSpec {
  if (v && typeof v === 'object' && !Array.isArray(v) && Array.isArray((v as { rules?: unknown }).rules)) {
    return v as ValidationSpec;
  }
  return {};
}

/** Parse a raw erp_change_request_entities row into typed, defaulted config. */
export function parseEntityRow(row: ChangeRequestEntityRow): ChangeRequestEntity {
  return {
    entityKey: row.entity_key,
    targetTable: row.target_table,
    idColumn: (row.id_column ?? 'id') || 'id',
    labelEn: row.label_en ?? null,
    labelAr: row.label_ar ?? null,
    createPermission: row.create_permission ?? null,
    approvePermission: row.approve_permission ?? null,
    workflowKey: resolveWorkflowKey(row.entity_key, row.workflow_key),
    allowedFields: row.allowed_fields == null ? null : asStringArray(row.allowed_fields),
    validation: asValidationSpec(row.validation),
    attachmentTypes: asStringArray(row.attachment_types),
    supportsEffectiveDating: row.supports_effective_dating ?? true,
    supportsBulk: row.supports_bulk ?? true,
    bulkMax: row.bulk_max ?? 1000,
    notificationTemplate: row.notification_template ?? null,
    isActive: row.is_active ?? true,
    companyId: row.company_id ?? null,
  };
}

/** Choose the effective row for a company: a company-specific row wins over the
 *  global default (company_id null). Returns null when neither is present. */
export function pickEntityRow<T extends { company_id: string | null }>(
  rows: T[],
  companyId: string | null,
): T | null {
  const company = companyId ? rows.find((r) => r.company_id === companyId) : undefined;
  if (company) return company;
  return rows.find((r) => r.company_id == null) ?? null;
}

// ── Code registries (extension seams) ───────────────────────────────────────
const validators = new Map<string, NamedValidator>();
const adapters = new Map<string, ApprovalAdapter>();

/** Register a named field validator (idempotent overwrite). Packs call this at import. */
export function registerValidator(name: string, fn: NamedValidator): void {
  validators.set(name, fn);
}
export function getValidator(name: string): NamedValidator | undefined {
  return validators.get(name);
}

/** Register an external approval adapter (email/ERP/government/API). */
export function registerApprovalAdapter(name: string, adapter: ApprovalAdapter): void {
  adapters.set(name, adapter);
}
export function getApprovalAdapter(name: string): ApprovalAdapter | undefined {
  return adapters.get(name);
}
