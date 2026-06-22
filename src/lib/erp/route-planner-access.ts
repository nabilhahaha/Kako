/**
 * Route Planner Access — the product-scoped role / feature / scope model that
 * governs what a user can do INSIDE the Route Planner experience.
 *
 * This is deliberately SELF-CONTAINED and independent of the global VANTORA
 * permission/module system. It is backed by the `erp_route_planner_access` table
 * (migration 0353) and managed only from /planner-admin.
 *
 * DEFAULT-PERMISSIVE: a Route Planner user with NO access row is treated as fully
 * unrestricted (every feature, company scope). So today's tenants are unchanged
 * until the admin explicitly assigns a role. Every consumer reads
 * `ctx.routePlannerAccess` (null = unrestricted) via the helpers below.
 */

/** Capabilities a user can be limited to inside Route Planner. */
export const RP_FEATURES = ['route_planning', 'day_planner', 'field_missions', 'reports'] as const;
export type RpFeature = (typeof RP_FEATURES)[number];

/** Roles INSIDE the Route Planner product (NOT global BranchRoles). */
export const RP_ROLES = ['route_planner_admin', 'manager', 'area_manager', 'supervisor', 'field_user'] as const;
export type RpRole = (typeof RP_ROLES)[number];

/** Hierarchy scope levels. `team` = a supervisor's direct reports. */
export const RP_SCOPE_LEVELS = ['company', 'region', 'area', 'team', 'self'] as const;
export type RpScopeLevel = (typeof RP_SCOPE_LEVELS)[number];

/**
 * Supervisor-Mission capabilities (the "thin admin slice"): finer-grained than the
 * `field_missions` feature. Execute = run an assigned mission; Create = author a mission;
 * Assign = give a mission to another user; Review = sign off on mission reports.
 */
export interface MissionPerms { canCreate: boolean; canAssign: boolean; canExecute: boolean; canReview: boolean }

/** Stored per-user override (jsonb on the access row). A present key wins over the role default. */
export interface MissionPermOverride { create?: boolean; assign?: boolean; execute?: boolean; review?: boolean }

/** Role defaults for mission capabilities. Managerial roles author+assign+review; field
 *  roles execute-only — overridable per user by a company admin. */
export const RP_ROLE_DEFAULT_MISSION_PERMS: Record<RpRole, MissionPerms> = {
  route_planner_admin: { canCreate: true,  canAssign: true,  canExecute: true, canReview: true },
  manager:             { canCreate: true,  canAssign: true,  canExecute: true, canReview: true },
  area_manager:        { canCreate: true,  canAssign: true,  canExecute: true, canReview: true },
  supervisor:          { canCreate: false, canAssign: false, canExecute: true, canReview: false },
  field_user:          { canCreate: false, canAssign: false, canExecute: true, canReview: false },
};

/** Resolve effective mission perms from a role + optional per-user override. Pure. */
export function resolveMissionPerms(role: RpRole, override?: MissionPermOverride | null): MissionPerms {
  const base = RP_ROLE_DEFAULT_MISSION_PERMS[role];
  const o = override ?? {};
  return {
    canCreate: o.create ?? base.canCreate,
    canAssign: o.assign ?? base.canAssign,
    canExecute: o.execute ?? base.canExecute,
    canReview: o.review ?? base.canReview,
  };
}

/** Mission perms for a resolved access (DEFAULT-PERMISSIVE: null access → all true). */
export function missionPermsOf(access: RoutePlannerAccess | null): MissionPerms {
  if (!access) return { canCreate: true, canAssign: true, canExecute: true, canReview: true };
  return access.missionPerms;
}

/** Resolved Route Planner access for the current user (within their company). */
export interface RoutePlannerAccess {
  role: RpRole;
  features: RpFeature[];
  scopeLevel: RpScopeLevel;
  regionId: string | null;
  areaId: string | null;
  supervisorId: string | null;
  teamId: string | null;
  /** Effective Supervisor-Mission capabilities (role default + per-user override). */
  missionPerms: MissionPerms;
  /** True when this was synthesised from a default (no explicit DB row exists). */
  isDefault: boolean;
}

/** Default feature set per role (used when a row omits features, or for previews). */
export const RP_ROLE_DEFAULT_FEATURES: Record<RpRole, RpFeature[]> = {
  route_planner_admin: [...RP_FEATURES],
  manager: [...RP_FEATURES],
  area_manager: ['route_planning', 'day_planner', 'field_missions', 'reports'],
  supervisor: ['field_missions', 'reports'],
  field_user: ['field_missions'],
};

/** Default scope per role (the role only SUGGESTS a scope; the row is authoritative). */
export const RP_ROLE_DEFAULT_SCOPE: Record<RpRole, RpScopeLevel> = {
  route_planner_admin: 'company',
  manager: 'company',
  area_manager: 'area',
  supervisor: 'team',
  field_user: 'self',
};

/** Shape of a raw `erp_route_planner_access` row (snake_case from Supabase). */
export interface RoutePlannerAccessRow {
  role: string | null;
  features: string[] | null;
  scope_level: string | null;
  region_id: string | null;
  area_id: string | null;
  supervisor_id: string | null;
  team_id: string | null;
  mission_perms?: MissionPermOverride | null;
}

function isRpRole(v: string | null | undefined): v is RpRole {
  return !!v && (RP_ROLES as readonly string[]).includes(v);
}
function isRpScope(v: string | null | undefined): v is RpScopeLevel {
  return !!v && (RP_SCOPE_LEVELS as readonly string[]).includes(v);
}

/**
 * Map a DB row into a typed `RoutePlannerAccess`. Falls back to role defaults for
 * features/scope when the row leaves them empty, so a half-configured row is never
 * accidentally locking. Returns null when the row is missing (→ unrestricted).
 */
export function mapRoutePlannerAccess(row: RoutePlannerAccessRow | null | undefined): RoutePlannerAccess | null {
  if (!row) return null;
  const role: RpRole = isRpRole(row.role) ? row.role : 'field_user';
  const rawFeatures = (row.features ?? []).filter((f): f is RpFeature => (RP_FEATURES as readonly string[]).includes(f));
  const features = rawFeatures.length > 0 ? rawFeatures : RP_ROLE_DEFAULT_FEATURES[role];
  const scopeLevel: RpScopeLevel = isRpScope(row.scope_level) ? row.scope_level : RP_ROLE_DEFAULT_SCOPE[role];
  return {
    role,
    features,
    scopeLevel,
    regionId: row.region_id ?? null,
    areaId: row.area_id ?? null,
    supervisorId: row.supervisor_id ?? null,
    teamId: row.team_id ?? null,
    missionPerms: resolveMissionPerms(role, row.mission_perms),
    isDefault: false,
  };
}

/**
 * Does the user hold a Route Planner feature? DEFAULT-PERMISSIVE: a null access
 * (no row, or a non-Route-Planner user) returns true — restriction only applies
 * once an explicit access row exists.
 */
export function rpHasFeature(access: RoutePlannerAccess | null, feature: RpFeature): boolean {
  if (!access) return true;
  return access.features.includes(feature);
}

/** Is the user effectively a Route Planner admin/manager (sees everything)? */
export function rpIsManagerial(access: RoutePlannerAccess | null): boolean {
  if (!access) return true; // unrestricted default
  return access.role === 'route_planner_admin' || access.role === 'manager';
}

/**
 * DEFAULT-RESTRICTIVE mission perms for WRITE actions (pilot posture).
 *
 * Unlike `missionPermsOf` (read-side, default-permissive), write flows must NOT be open
 * to everyone when a company has not configured Route Planner access yet:
 *   - an explicit access row  → its role default + per-user override (authoritative);
 *   - NO access row + company admin → full capability (admin-driven management);
 *   - NO access row + normal user  → DENIED (all false).
 * The database RLS (company scope + creator/assignee/admin) remains the backstop, so this
 * is defence-in-depth, never the sole gate.
 */
export function missionPermsRestrictive(access: RoutePlannerAccess | null, isCompanyAdmin: boolean): MissionPerms {
  if (access) return access.missionPerms;
  return isCompanyAdmin
    ? { canCreate: true, canAssign: true, canExecute: true, canReview: true }
    : { canCreate: false, canAssign: false, canExecute: false, canReview: false };
}

/**
 * D2 request-decision gate (default-restrictive): a company admin, or an explicit
 * managerial Route Planner role (manager / area_manager / route_planner_admin), may
 * approve / reject / request-info on requests. Everyone else is denied (they can still
 * SUBMIT their own request). Self-approval is blocked separately in the action.
 */
export function rpCanDecideRequests(role: RpRole | null | undefined, isCompanyAdmin: boolean): boolean {
  return isCompanyAdmin || role === 'manager' || role === 'area_manager' || role === 'route_planner_admin';
}
