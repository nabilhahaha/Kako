// ============================================================================
// Multi-Form Field Work — assignment matching (pure, no I/O / no React).
//
// Decides whether a given user is offered a form, based on the form's active
// assignments and the user's org scope. Mirrors the erp_form_assignments target model
// (migration 0379). USER-scope targets (user/role/team/department/branch/supervisor)
// grant visibility; CUSTOMER-scope targets (dataset/city/channel) only narrow which
// customers a form applies to and are ignored here (handled by the customer picker).
//
// Kept pure so the My-Forms gate is unit-tested and reusable on both client and server.
// The DB also enforces company scope + (later) an erp_user_form_ids() resolver; this is
// the app-level mirror of the same rule.
// ============================================================================

export type AssignmentTargetType =
  | 'user'
  | 'role'
  | 'team'
  | 'department'
  | 'branch'
  | 'supervisor'
  | 'dataset'
  | 'city'
  | 'channel';

/** USER-scope target types decide who can SEE/FILL a form. */
export const USER_SCOPE_TARGETS: AssignmentTargetType[] = [
  'user', 'role', 'team', 'department', 'branch', 'supervisor',
];
/** CUSTOMER-scope target types only narrow which customers a form applies to. */
export const CUSTOMER_SCOPE_TARGETS: AssignmentTargetType[] = ['dataset', 'city', 'channel'];

export function isUserScopeTarget(t: AssignmentTargetType): boolean {
  return USER_SCOPE_TARGETS.includes(t);
}
export function isCustomerScopeTarget(t: AssignmentTargetType): boolean {
  return CUSTOMER_SCOPE_TARGETS.includes(t);
}

export interface FormAssignment {
  targetType: AssignmentTargetType;
  targetValue: string;
  isActive: boolean;
}

/** Everything about a user needed to match user-scope assignments. ids are strings. */
export interface UserScope {
  userId: string;
  /** Role keys the user holds (e.g. 'admin','manager','supervisor','salesman','viewer'). */
  roles: string[];
  teamIds: string[];
  departmentIds: string[];
  branchIds: string[];
  /** User ids of supervisors in this user's reporting chain (self upward). */
  supervisorIds: string[];
}

/** The wildcard role value: a `role`/'all' assignment offers the form to everyone. */
export const ROLE_ALL = 'all';

function matchesUserScope(a: FormAssignment, s: UserScope): boolean {
  switch (a.targetType) {
    case 'user':       return a.targetValue === s.userId;
    case 'role':       return a.targetValue === ROLE_ALL || s.roles.includes(a.targetValue);
    case 'team':       return s.teamIds.includes(a.targetValue);
    case 'department': return s.departmentIds.includes(a.targetValue);
    case 'branch':     return s.branchIds.includes(a.targetValue);
    case 'supervisor': return s.supervisorIds.includes(a.targetValue);
    default:           return false; // customer-scope targets don't grant visibility
  }
}

/** True if at least one ACTIVE user-scope assignment matches the user. A form with no
 *  user-scope assignment is offered to NOBODY (admins reach it via the admin library,
 *  not via My Forms). */
export function userCanAccessForm(assignments: FormAssignment[], scope: UserScope): boolean {
  return assignments.some((a) => a.isActive && isUserScopeTarget(a.targetType) && matchesUserScope(a, scope));
}

/** The customer-scope filters on a form (dataset/city/channel) the picker should apply.
 *  Empty arrays = no restriction (any in-scope customer). */
export interface CustomerScopeFilters {
  datasetIds: string[];
  cities: string[];
  channels: string[];
}

export function customerScopeFilters(assignments: FormAssignment[]): CustomerScopeFilters {
  const datasetIds: string[] = [];
  const cities: string[] = [];
  const channels: string[] = [];
  for (const a of assignments) {
    if (!a.isActive) continue;
    if (a.targetType === 'dataset') datasetIds.push(a.targetValue);
    else if (a.targetType === 'city') cities.push(a.targetValue);
    else if (a.targetType === 'channel') channels.push(a.targetValue);
  }
  return { datasetIds, cities, channels };
}
