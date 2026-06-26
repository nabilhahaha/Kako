import type { Permission } from './permissions';

/**
 * SINGLE source of truth for the limited, product-scoped "Route Planner Admin".
 *
 * This admin manages ONLY Route Planner tenants (companies / demo trials) and their
 * subscriptions — it gets none of the full VANTORA platform (no ERP modules, finance,
 * global settings or unrelated navigation). The app reads ONE boolean,
 * `ctx.isRoutePlannerAdmin`, and how that is computed lives ONLY in
 * `isRoutePlannerAdminAccount` below, so we can migrate from email-detection to a real
 * `route_planner_admin` role (or the `route_planner.admin` permission) later by editing
 * just this one function.
 */

/** First-release admin account (email detection). */
export const ROUTE_PLANNER_ADMIN_EMAIL = 'planner-admin@vantora.com';

/** A future dedicated role key (not yet wired to BranchRole). */
export const ROUTE_PLANNER_ADMIN_ROLE = 'route_planner_admin';

/**
 * Companies that belong to the Route Planner product are tagged by their `plan_key`.
 * Anything starting with this prefix is a Route Planner tenant the admin may manage.
 */
export const ROUTE_PLANNER_PLAN_PREFIX = 'route_planner';
export const ROUTE_PLANNER_PLAN_TRIAL = 'route_planner_trial';
export const ROUTE_PLANNER_PLAN_MONTHLY = 'route_planner_monthly';
export const ROUTE_PLANNER_PLAN_ANNUAL = 'route_planner_annual';

export function isRoutePlannerTenantPlan(planKey: string | null | undefined): boolean {
  return (planKey ?? '').startsWith(ROUTE_PLANNER_PLAN_PREFIX);
}

export interface RoutePlannerAdminInput {
  email?: string | null;
  topRole?: string | null;
  permissions?: readonly Permission[];
}

/**
 * Is this the platform-scoped Route Planner Admin (the VENDOR console at /planner-admin that
 * manages RP *tenants* + their subscriptions)? Change ONLY this function to upgrade the
 * detection strategy — every consumer just reads the resulting boolean.
 *
 * IMPORTANT: this is the VENDOR admin, NOT a company's own RP admin. The company-scoped
 * `route_planner.admin` permission is an in-tenant capability (managing that company's RP
 * access/missions) and MUST NOT promote an ordinary tenant admin into the vendor console —
 * otherwise a normal Route Planner company admin gets bounced to /planner-admin instead of
 * landing in their own Route Planner workspace. So this is gated to the dedicated vendor
 * account only (email today; a real platform role later). True platform owners are routed to
 * /platform separately, so they are intentionally not matched here.
 */
export function isRoutePlannerAdminAccount(input: RoutePlannerAdminInput): boolean {
  // v1 (now): the dedicated vendor account, by email.
  if ((input.email ?? '').trim().toLowerCase() === ROUTE_PLANNER_ADMIN_EMAIL) return true;
  // v2 (later): a dedicated platform role — uncomment when `route_planner_admin` is provisioned.
  // if (input.topRole === ROUTE_PLANNER_ADMIN_ROLE) return true;
  // NOTE: the `route_planner.admin` PERMISSION is deliberately NOT a trigger — it is a
  // company-level RP-admin capability, not vendor-console access.
  return false;
}
