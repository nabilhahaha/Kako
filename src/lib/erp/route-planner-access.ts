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

/** Resolved Route Planner access for the current user (within their company). */
export interface RoutePlannerAccess {
  role: RpRole;
  features: RpFeature[];
  scopeLevel: RpScopeLevel;
  regionId: string | null;
  areaId: string | null;
  supervisorId: string | null;
  teamId: string | null;
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
