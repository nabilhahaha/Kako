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

/** Field access levels (low → high). `request` (G6) sits between view and edit:
 *  the field is read-only for direct writes, but the user may submit a change
 *  request for it (the request UI is wired in G7). */
export type AccessLevel = 'hidden' | 'view' | 'request' | 'edit' | 'required';
/** A field/section access row is keyed by a SUBJECT: a legacy role, a legacy
 *  flat permission, or (P5) a granular capability (module.resource.action). */
export type SubjectType = 'role' | 'permission' | 'capability';
export type FieldSource = 'core' | 'custom';
export type InheritanceMode = 'none' | 'inherit' | 'inherit_locked';

export const ACCESS_RANK: Record<AccessLevel, number> = { hidden: 0, view: 1, request: 2, edit: 3, required: 4 };
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
  /** (P5) The user's effective granular capabilities (expandAliases of perms).
   *  Matches access rows whose subjectType === 'capability'. Optional → []. */
  userCapabilities?: string[];
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
  const caps = i.userCapabilities ?? [];
  const matches = i.accessRows.filter(
    (r) =>
      (r.subjectType === 'role' && i.userRoles.includes(r.subjectKey)) ||
      (r.subjectType === 'permission' && i.userPermissions.includes(r.subjectKey)) ||
      (r.subjectType === 'capability' && caps.includes(r.subjectKey)),
  );
  let level: AccessLevel = matches.length ? mostPermissive(matches.map((m) => m.access)) : i.defaultAccess;
  if (i.isAdmin) level = clampForAdmin(level, i.isProtected);
  return level;
}

// ── Section-level access binding (P5 / DFG field-section binding) ────────────
/** A section is gated binary: hidden or visible. Subjects mirror field access
 *  (role / permission / capability). */
export type SectionAccessLevel = 'hidden' | 'view';
export interface SectionAccessRow {
  subjectType: SubjectType;
  subjectKey: string;
  access: SectionAccessLevel;
}

/** Is a section visible to the current user? CUTOVER-SAFE: a section with NO
 *  access rows is always visible (today's behavior); admins always see every
 *  section. Once a section HAS rows it becomes restricted — visible only when the
 *  user matches a row granting 'view' (most-permissive across matches; an explicit
 *  'hidden' match never grants). A user matching no row of a restricted section is
 *  hidden. */
export function isSectionAccessible(
  rows: SectionAccessRow[] | undefined,
  userRoles: string[],
  userPermissions: string[],
  userCapabilities: string[],
  isAdmin: boolean,
): boolean {
  if (isAdmin) return true;
  if (!rows || rows.length === 0) return true; // ungoverned section → visible
  const matches = rows.filter(
    (r) =>
      (r.subjectType === 'role' && userRoles.includes(r.subjectKey)) ||
      (r.subjectType === 'permission' && userPermissions.includes(r.subjectKey)) ||
      (r.subjectType === 'capability' && userCapabilities.includes(r.subjectKey)),
  );
  if (matches.length === 0) return false; // restricted section, user not granted
  return matches.some((m) => m.access === 'view'); // most-permissive among matches
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
  if (isProtected && (access === 'view' || access === 'request')) return 'protected_field_admin_must_edit';
  return null;
}

// ── Layout resolution over raw governance inputs (shared client + server) ────
export interface GovField {
  key: string;
  source: FieldSource;
  isProtected: boolean;
  defaultAccess: AccessLevel;
  isActive: boolean;
  section: string | null;
  condition: FieldCondition | null;
  accessRows: AccessRow[];
}
export interface GovInputs {
  fields: GovField[];
  userRoles: string[];
  userPermissions: string[];
  /** (P5) expanded granular capabilities; optional → []. */
  userCapabilities?: string[];
  /** (P5) per-section access rows, keyed by section key. A field whose section is
   *  not accessible resolves to 'hidden'. Optional → no section gating. */
  sectionAccess?: Record<string, SectionAccessRow[]>;
  isAdmin: boolean;
}

/** Resolve every field's access for a record context. Pure → usable in the
 *  client form (live values) and the server write path (submitted payload).
 *  (P5) A field in a section the user can't access resolves to 'hidden'. */
export function resolveLayout(g: GovInputs, recordContext: Record<string, unknown>): Map<string, AccessLevel> {
  const m = new Map<string, AccessLevel>();
  const caps = g.userCapabilities ?? [];
  for (const f of g.fields) {
    let level = resolveAccess({
      defaultAccess: f.defaultAccess,
      isProtected: f.isProtected,
      isActive: f.isActive,
      applicable: evaluateCondition(f.condition, recordContext),
      accessRows: f.accessRows,
      userRoles: g.userRoles,
      userPermissions: g.userPermissions,
      userCapabilities: caps,
      isAdmin: g.isAdmin,
    });
    if (
      f.section &&
      g.sectionAccess &&
      !isSectionAccessible(g.sectionAccess[f.section], g.userRoles, g.userPermissions, caps, g.isAdmin)
    ) {
      level = 'hidden';
    }
    m.set(f.key, level);
  }
  return m;
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
    // hidden/view/request are all read-only for a DIRECT write — keep the current
    // value (request additionally offers a change-request path in the UI, G7).
    if (f.access === 'hidden' || f.access === 'view' || f.access === 'request') {
      if (f.key in current) data[f.key] = current[f.key];
      else delete data[f.key];
    } else if (f.access === 'required') {
      const v = data[f.key];
      if (v === undefined || v === null || v === '') missingRequired.push(f.key);
    }
  }
  return { data, missingRequired };
}
