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
/** Core ERP modules whose presence means a tenant is a FULL ERP company (FMCG / distribution /
 *  retail), NOT a dedicated Route Planner tenant — so the `route_management` signal must NOT pull
 *  them into the chrome-free RP experience. */
const RP_CORE_ERP_MODULES = ['sales', 'inventory', 'accounting', 'purchasing', 'distribution'] as const;

export function isRoutePlannerExperience(input: {
  email?: string | null;
  companyPlanKey?: string | null;
  /** The company's business type — `route_planner` is a first-class RP tenant signal. */
  businessType?: string | null;
  /** The company's enabled modules — used for the RP-centric `route_management` fallback. */
  modules?: readonly string[] | null;
}): boolean {
  // 1) Membership of a Route Planner tenant by PLAN (trial / monthly / annual).
  if (isRoutePlannerTenantPlan(input.companyPlanKey)) return true;
  // 2) A company whose BUSINESS TYPE is route_planner — the natural "Create company" signal.
  if ((input.businessType ?? '').toLowerCase() === 'route_planner') return true;
  // 3) Fallback: the route_management module is enabled AND the tenant is RP-CENTRIC. A full-ERP
  //    company (FMCG/distribution) that merely includes route planning among many modules keeps
  //    its normal ERP — so any core-ERP module disqualifies this signal.
  const mods = input.modules ?? [];
  if (mods.includes('route_management') && !mods.some((m) => (RP_CORE_ERP_MODULES as readonly string[]).includes(m))) return true;
  // 4) Temporary dev trigger (remove once real tenants exist): the demo email.
  if (isRoutePlannerDemoAccount({ email: input.email })) return true;
  return false;
}
