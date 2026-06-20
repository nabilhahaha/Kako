import { isRoutePlannerDemoAccount } from './route-planner-demo';
import { isRoutePlannerTenantPlan } from './route-planner-admin';

/**
 * SINGLE driver for the standalone "Route Planner experience" (chrome-free layout,
 * login redirect, branded focus mode).
 *
 * Long-term architecture (the one that matters):
 *
 *     Route Planner tenant/company  →  Route Planner experience
 *
 * Any user who BELONGS TO a Route Planner company — i.e. the company's `plan_key` starts
 * with `route_planner` (trial / monthly / annual), the same companies the Route Planner
 * Admin Console creates — automatically gets the full Route Planner experience. No email
 * allow-list, no per-user wiring.
 *
 * The demo email is ONLY a temporary development trigger so the experience can be shown
 * before any real tenant exists; it is layered on top and can be dropped at any time by
 * deleting the one line below — every consumer just reads `ctx.isRoutePlannerExperience`.
 */
export function isRoutePlannerExperience(input: { email?: string | null; companyPlanKey?: string | null }): boolean {
  // Primary, permanent rule: membership of a Route Planner tenant.
  if (isRoutePlannerTenantPlan(input.companyPlanKey)) return true;
  // Temporary dev trigger (remove once real tenants exist): the demo email.
  if (isRoutePlannerDemoAccount({ email: input.email })) return true;
  return false;
}
