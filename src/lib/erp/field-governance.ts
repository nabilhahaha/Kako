/**
 * Dynamic Field Governance — pure resolution core (DFG-1).
 *
 * Platform-wide, entity-agnostic. Given a company's per-field configuration and
 * per-subject access rows, resolves the effective access level for the current
 * user + record. Two backing tables (erp_field_config, erp_field_access) feed
 * this; the server loader builds the inputs, this module decides.
 *
 * Invariants:
 *  - Safe defaults: with no config/access rows, every field resolves to its
 *    registry default ('edit') → behaves exactly as today.
 *  - Admin lockout protection: company admins are never returned 'hidden' by the
 *    access rules, and protected fields stay ≥ 'edit' for them.
 */

export type AccessLevel = 'hidden' | 'view' | 'edit' | 'required';
export type SubjectType = 'role' | 'permission';
export type FieldSource = 'core' | 'custom';
export type InheritanceMode = 'none' | 'inherit' | 'inherit_locked';

export const ACCESS_RANK: Record<AccessLevel, number> = { hidden: 0, view: 1, edit: 2, required: 3 };
export const REGISTRY_DEFAULT_ACCESS: AccessLevel = 'edit';

/** Highest (most-permissive) of the given levels; 'hidden' when empty. */
export function mostPermissive(levels: AccessLevel[]): AccessLevel {
  return levels.reduce<AccessLevel>((a, b) => (ACCESS_RANK[b] > ACCESS_RANK[a] ? b : a), 'hidden');
}

export interface AccessRow {
  subjectType: SubjectType;
  subjectKey: string; // role key OR permission key
  access: AccessLevel;
}

export interface ResolveInput {
  /** field_config.default_access, or REGISTRY_DEFAULT_ACCESS when no config row. */
  defaultAccess: AccessLevel;
  /** Identity/critical field — admins are clamped to ≥ edit; can't be disabled. */
  isProtected: boolean;
  /** field_config.is_active — company-wide on/off (protected fields stay active). */
  isActive: boolean;
  /** Result of the field's condition against the record/company context. */
  applicable: boolean;
  /** Access rows for this (company, entity, field). */
  accessRows: AccessRow[];
  userRoles: string[];
  userPermissions: string[];
  /** Company admin / IT admin / platform owner. */
  isAdmin: boolean;
}

/** Admins are never hidden by access rules; protected fields stay editable. */
function clampForAdmin(level: AccessLevel, isProtected: boolean): AccessLevel {
  const floor: AccessLevel = isProtected ? 'edit' : 'view';
  return ACCESS_RANK[level] >= ACCESS_RANK[floor] ? level : floor;
}

/** Effective access for one field. Precedence: applicability → company-active →
 *  subject access (most-permissive across the user's roles AND permissions) →
 *  admin safety. */
export function resolveAccess(i: ResolveInput): AccessLevel {
  if (!i.applicable) return 'hidden';                 // not applicable for this record/company
  if (!i.isActive) return 'hidden';                   // company disabled (protected stays active by guard)
  const matches = i.accessRows.filter(
    (r) =>
      (r.subjectType === 'role' && i.userRoles.includes(r.subjectKey)) ||
      (r.subjectType === 'permission' && i.userPermissions.includes(r.subjectKey)),
  );
  let level: AccessLevel = matches.length ? mostPermissive(matches.map((m) => m.access)) : i.defaultAccess;
  if (i.isAdmin) level = clampForAdmin(level, i.isProtected);
  return level;
}

// ── Conditional applicability (customer-type / context rules) ────────────────
export type ConditionOp = 'eq' | 'neq' | 'in' | 'gt' | 'lt' | 'is_set' | 'is_true';
export interface FieldCondition { when: string; op: ConditionOp; value?: unknown }

/** Evaluate a field's applicability condition against a record/company context. */
export function evaluateCondition(cond: FieldCondition | null | undefined, ctx: Record<string, unknown>): boolean {
  if (!cond || !cond.when) return true;
  const v = ctx[cond.when];
  switch (cond.op) {
    case 'eq': return String(v ?? '') === String(cond.value ?? '');
    case 'neq': return String(v ?? '') !== String(cond.value ?? '');
    case 'in': return Array.isArray(cond.value) && (cond.value as unknown[]).map(String).includes(String(v ?? ''));
    case 'gt': return Number(v) > Number(cond.value);
    case 'lt': return Number(v) < Number(cond.value);
    case 'is_set': return v !== null && v !== undefined && v !== '';
    case 'is_true': return v === true || v === 'true';
    default: return true;
  }
}

// ── Admin lockout protection (invariant) ────────────────────────────────────
/** Role subjects that must never be locked out of fields / the governance UI. */
export const ADMIN_SUBJECT_ROLES = ['admin', 'it_admin'];

/** Reason if a config change would lock admins out (protected field can't be
 *  globally disabled or defaulted hidden), else null. */
export function configLockoutViolation(
  isProtected: boolean,
  patch: { is_active?: boolean; default_access?: AccessLevel },
): string | null {
  if (!isProtected) return null;
  if (patch.is_active === false) return 'protected_field_cannot_be_disabled';
  if (patch.default_access === 'hidden') return 'protected_field_cannot_be_hidden';
  return null;
}

/** Reason if an access row would lock an admin subject out, else null. */
export function accessLockoutViolation(
  isProtected: boolean,
  subjectType: SubjectType,
  subjectKey: string,
  access: AccessLevel,
): string | null {
  const isAdminSubject = subjectType === 'role' && ADMIN_SUBJECT_ROLES.includes(subjectKey);
  if (!isAdminSubject) return null;
  if (access === 'hidden') return 'cannot_hide_from_admin';
  if (isProtected && access === 'view') return 'protected_field_admin_must_edit';
  return null;
}

// ── Write enforcement (the real protection) ──────────────────────────────────
export interface ResolvedField { key: string; access: AccessLevel }

/** Strip fields the user cannot edit (keep the current value) and report empty
 *  required fields. Fields not present in `fields` pass through untouched, so a
 *  zero-config entity is unaffected. */
export function applyWriteAccess(
  fields: ResolvedField[],
  input: Record<string, unknown>,
  current: Record<string, unknown>,
): { data: Record<string, unknown>; missingRequired: string[] } {
  const data: Record<string, unknown> = { ...input };
  const missingRequired: string[] = [];
  for (const f of fields) {
    if (f.access === 'hidden' || f.access === 'view') {
      if (f.key in current) data[f.key] = current[f.key];
      else delete data[f.key];
    } else if (f.access === 'required') {
      const v = data[f.key];
      if (v === undefined || v === null || v === '') missingRequired.push(f.key);
    }
  }
  return { data, missingRequired };
}
