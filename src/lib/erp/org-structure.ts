import type { BranchRole } from './types';

/**
 * Company Onboarding — Organization Structure.
 *
 * Roles are OPTIONAL per company, and the reporting hierarchy adapts to whichever
 * roles are chosen. Given a selected role set, `resolveHierarchy` derives each
 * role's reports-to role by walking a canonical chain-of-command and rerouting to
 * the NEAREST SELECTED ancestor — so depth varies automatically:
 *   Manager + Salesman            ⇒ salesman → manager
 *   Manager + Supervisor + Sales  ⇒ salesman → supervisor → manager
 *   FMCG full                     ⇒ salesman → supervisor → branch_manager → … → admin
 * The result is a suggestion the operator can override per role in the wizard, and
 * the Company Admin can edit later. It feeds erp_org_role_hierarchy, which drives
 * SCOPE through the existing P3 machinery (reports_to → erp_user_subtree).
 */

/** Line-of-command seniority (most senior first). reports_to for a line role is
 *  the nearest MORE-SENIOR selected line role. `manager` sits just under admin so
 *  a company with only Manager + field roles routes everyone to the manager. */
const LINE_ORDER: BranchRole[] = [
  'admin',
  'manager',
  'national_sales_manager',
  'sales_director',
  'regional_manager',
  'area_manager',
  'branch_manager',
  'supervisor',
  'salesman',
];

/** Functional (non-line) roles report into a line role; rerouted to the nearest
 *  selected ancestor of that target if it isn't selected. */
const STAFF_PARENT: Partial<Record<BranchRole, BranchRole>> = {
  accountant: 'admin',
  trade_marketing_manager: 'admin',
  it_admin: 'admin',
  warehouse_keeper: 'branch_manager',
  cashier: 'branch_manager',
  driver: 'supervisor',
  doctor: 'manager',
  receptionist: 'manager',
  technician: 'manager',
  stylist: 'manager',
  housekeeping: 'manager',
  staff: 'manager',
  viewer: 'manager',
};

export interface HierarchyEdge {
  roleKey: BranchRole;
  reportsToRoleKey: BranchRole | null;
}

/** Nearest more-senior SELECTED line role above `role` (or null). */
function lineSeniorAncestor(role: BranchRole, selected: Set<BranchRole>): BranchRole | null {
  const idx = LINE_ORDER.indexOf(role);
  if (idx < 0) return null;
  for (let j = idx - 1; j >= 0; j--) {
    if (selected.has(LINE_ORDER[j])) return LINE_ORDER[j];
  }
  return null;
}

/** Derive the reports-to edges for a selected role set. admin is the root (no
 *  edge). Every other selected role gets a parent (or null if none is selected
 *  above it — should only happen when admin is deselected, which the wizard
 *  prevents). */
export function resolveHierarchy(selectedRoles: readonly BranchRole[]): HierarchyEdge[] {
  const selected = new Set<BranchRole>(selectedRoles);
  const edges: HierarchyEdge[] = [];
  for (const role of selectedRoles) {
    if (role === 'admin') continue;
    let parent: BranchRole | null;
    if (LINE_ORDER.includes(role)) {
      parent = lineSeniorAncestor(role, selected);
    } else {
      const target = STAFF_PARENT[role] ?? 'admin';
      if (selected.has(target)) parent = target;
      else if (LINE_ORDER.includes(target)) parent = lineSeniorAncestor(target, selected) ?? (selected.has('admin') ? 'admin' : null);
      else parent = selected.has('admin') ? 'admin' : null;
    }
    if (parent === null && selected.has('admin')) parent = 'admin';
    edges.push({ roleKey: role, reportsToRoleKey: parent });
  }
  return edges;
}

/** Does this role manage anyone (is it a parent in the resolved hierarchy)? Used
 *  to suggest a team-visibility scope for managers vs. own-data for leaf roles. */
export function isManagerRole(role: BranchRole, edges: HierarchyEdge[]): boolean {
  return edges.some((e) => e.reportsToRoleKey === role);
}

/** Validate a role selection: admin is mandatory (the owner role). */
export function validateRoleSelection(selectedRoles: readonly BranchRole[]): { ok: true } | { ok: false; reason: 'admin_required' | 'empty' } {
  if (selectedRoles.length === 0) return { ok: false, reason: 'empty' };
  if (!selectedRoles.includes('admin')) return { ok: false, reason: 'admin_required' };
  return { ok: true };
}
