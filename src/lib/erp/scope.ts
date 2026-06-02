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
