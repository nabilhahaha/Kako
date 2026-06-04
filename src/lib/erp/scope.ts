/** FMCG hierarchy S4 — visibility scope classification.
 *
 *  Source of truth for enforcement is RLS (migration 0104). This TS mirror lets
 *  the app reason about whether the current user is company-wide or scoped (e.g.
 *  to show a "scoped view" hint) WITHOUT re-implementing the row predicate — the
 *  database still decides which rows are visible.
 *
 *  Keep `SCOPED_ROLES` in sync with `erp_user_is_company_wide()` in 0104. */

import type { BranchRole } from './types';

/** The only roles that are SCOPED. Every other role (admin, manager,
 *  sales_director, national_sales_manager, accountant, it_admin, viewer, and all
 *  non-sales roles) is company-wide — matching 0104's zero-regression rule. */
export const SCOPED_ROLES: readonly BranchRole[] = [
  'regional_manager',
  'area_manager',
  'branch_manager',
  'supervisor',
  'salesman',
] as const;

export function isScopedRole(role: BranchRole): boolean {
  return SCOPED_ROLES.includes(role);
}

/** A user is company-wide if they hold ANY non-scoped role (or none of their
 *  roles is scoped). Mirrors `erp_user_is_company_wide()` (excluding the
 *  platform-owner / super-admin bypass, which the DB handles). */
export function isCompanyWide(roles: readonly BranchRole[]): boolean {
  return roles.some((r) => !isScopedRole(r));
}

// ── Authorization Phase 3 (P3): per-assignment ScopeRef ──────────────────────
// Mirrors migration 0121 (erp_role_scope). Enforcement remains in RLS; these
// types let the app reason about declared assignments without re-implementing the
// row predicate. CUTOVER-SAFE: with no rows, the DB falls back to 0104/0105.

/** The scope dimensions a per-assignment ScopeRef can declare. Must match the
 *  `dimension` CHECK constraint in erp_role_scope (0121). `own_team` is the only
 *  TRANSITIVE dimension (multi-level subtree) and is opt-in via an explicit row. */
export const SCOPE_DIMENSIONS = [
  'company',
  'branch',
  'region',
  'area',
  'own_customers',
  'own_team',
] as const;

export type ScopeDimension = (typeof SCOPE_DIMENSIONS)[number];

/** A declared per-assignment scope. `scopeSet` holds explicit entity ids
 *  (branch/region/area uuids) for the geo dimensions; it is ignored for
 *  `company` / `own_customers` / `own_team`. Mirrors one erp_role_scope row. */
export interface ScopeRef {
  id: string;
  companyId: string;
  userId: string;
  roleKey: string;
  dimension: ScopeDimension;
  scopeSet: string[];
}

export function isScopeDimension(value: string): value is ScopeDimension {
  return (SCOPE_DIMENSIONS as readonly string[]).includes(value);
}

/** `own_team` is the only transitive dimension (recursive subtree closure). */
export function isTransitiveDimension(dimension: ScopeDimension): boolean {
  return dimension === 'own_team';
}

/** Maps a raw erp_role_scope row (snake_case) into a typed ScopeRef. Read helper
 *  only — no enforcement; RLS is the source of truth. */
export function toScopeRef(row: {
  id: string;
  company_id: string;
  user_id: string;
  role_key: string;
  dimension: string;
  scope_set: unknown;
}): ScopeRef | null {
  if (!isScopeDimension(row.dimension)) return null;
  const scopeSet = Array.isArray(row.scope_set)
    ? row.scope_set.filter((v): v is string => typeof v === 'string')
    : [];
  return {
    id: row.id,
    companyId: row.company_id,
    userId: row.user_id,
    roleKey: row.role_key,
    dimension: row.dimension,
    scopeSet,
  };
}
