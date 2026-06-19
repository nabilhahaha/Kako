import type { Permission } from './permissions';

/**
 * SINGLE source of truth for the locked-down "Route Planner Demo" experience.
 *
 * The whole app reads ONE boolean — `ctx.isRoutePlannerDemo` — to decide the demo
 * lockdown (chrome-free layout, redirect to the planner, branded focus mode). How that
 * boolean is computed lives ONLY in `isRoutePlannerDemoAccount` below, so we can migrate
 * from email-detection to a dedicated role later by editing this one function — no UI,
 * navigation, layout, or page changes required.
 */

/** First-release demo account (email detection). */
export const ROUTE_PLANNER_DEMO_EMAIL = 'demo@vantora.com';

/** A future dedicated role key (not yet wired to BranchRole). Detection can switch to
 *  `input.topRole === ROUTE_PLANNER_DEMO_ROLE` once the role is provisioned. */
export const ROUTE_PLANNER_DEMO_ROLE = 'route_planner_demo';

export interface RoutePlannerDemoInput {
  email?: string | null;
  topRole?: string | null;
  permissions?: readonly Permission[];
}

/**
 * Is this the Route Planner Demo account? Change ONLY this function to upgrade the
 * detection strategy (email → role) — every consumer just reads the resulting boolean.
 */
export function isRoutePlannerDemoAccount(input: RoutePlannerDemoInput): boolean {
  // ── Detection strategy (edit here only) ──────────────────────────────────────
  // v1 (now): email match.
  if ((input.email ?? '').trim().toLowerCase() === ROUTE_PLANNER_DEMO_EMAIL) return true;
  // v2 (later): a dedicated role — uncomment when `route_planner_demo` is provisioned.
  // if (input.topRole === ROUTE_PLANNER_DEMO_ROLE) return true;
  return false;
}
