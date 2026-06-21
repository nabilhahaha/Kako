/** ── Platform Owner feature catalog ────────────────────────────────────────
 *  The per-company feature/module control surface for the VANTORA Platform Admin
 *  Console. Each entry is a key stored in the EXISTING `erp_company_modules`
 *  (company_id, module, enabled) table — the same store the ERP navigation +
 *  auth-context already gate on. No new feature model is introduced; this is just
 *  the curated, grouped list the Platform Owner toggles per tenant.
 *
 *  Most keys are existing `Module` keys (so disabling them removes the matching
 *  menus/routes via the shared gate). A few FMCG-specific keys (fmcg_standard,
 *  fmcg_cash_van, collections) are new product feature keys — stored in the same
 *  table (module is a free-text column) and read back by the same scoped gate.
 *
 *  Pure + client-safe (no 'use server'), so the console can import it for labels.
 *  Human labels live in i18n under `routePlanner.feat_<key>` / `routePlanner.featGroup_<group>`. */

export type PlannerFeatureGroup = 'platform' | 'sales' | 'operations' | 'system';

export interface PlannerFeature {
  /** erp_company_modules.module key (the value persisted + gated on). */
  key: string;
  group: PlannerFeatureGroup;
}

export const PLANNER_FEATURE_GROUPS: PlannerFeatureGroup[] = ['platform', 'sales', 'operations', 'system'];

export const PLANNER_FEATURES: PlannerFeature[] = [
  // Platform / product lines
  { key: 'fmcg_standard',   group: 'platform' },
  { key: 'fmcg_cash_van',   group: 'platform' },
  { key: 'route_management', group: 'platform' },
  // Sales
  { key: 'van_sales',    group: 'sales' },
  { key: 'sales_orders', group: 'sales' },
  { key: 'returns',      group: 'sales' },
  { key: 'collections',  group: 'sales' },
  { key: 'pos',          group: 'sales' },
  // Operations
  { key: 'inventory',     group: 'operations' },
  { key: 'trade_spend',   group: 'operations' },
  { key: 'merchandising', group: 'operations' },
  { key: 'pharmacy',      group: 'operations' },
  // System
  { key: 'analytics',       group: 'system' },
  { key: 'workflow',        group: 'system' },
  { key: 'change_requests', group: 'system' },
  { key: 'integrations',    group: 'system' },
];

/** All managed feature keys (for seeding / reading explicit per-company rows). */
export const PLANNER_FEATURE_KEYS: string[] = PLANNER_FEATURES.map((f) => f.key);

/** Features enabled by default for a brand-new tenant on a given product focus.
 *  A Route Planner tenant gets the planner + reporting + requests; the rest are
 *  off until the owner enables them. Empty/unknown focus → planner essentials. */
export function defaultFeaturesForPlan(): string[] {
  return ['route_management', 'analytics', 'workflow', 'change_requests'];
}
