// ============================================================================
// Entity 360 Platform — profile registry (Phase 7). Pure data: each entity type
// declares its panels (sourced from existing read-models). Adding a new 360 =
// registering a profile, NOT building a new page. No I/O.
// ============================================================================

import type { Entity360Profile, Entity360Type } from './types';

const panel = (key: string, label: string, source: string, defaultVisible = true) => ({ key, label, source, defaultVisible });

/** Built-in 360 profiles (company-extensible). */
export const ENTITY_360_PROFILES: readonly Entity360Profile[] = [
  { entity: 'customer', label: 'Customer 360', panels: [
    panel('timeline', 'Timeline', 'customer-timeline'),
    panel('orders', 'Orders', 'erp_sales_orders'),
    panel('visits', 'Visits', 'erp_visits'),
    panel('collections', 'Collections', 'collections'),
    panel('returns', 'Returns', 'returns'),
    panel('promotions', 'Promotions', 'attribution'),
    panel('near_expiry', 'Near Expiry', 'near-expiry'),
    panel('ownership', 'Ownership History', 'ownership'),
    panel('profitability', 'Profitability', 'commercial/profitability', false),
    panel('health', 'Health & Risk', 'customer-timeline/health'),
  ] },
  { entity: 'product', label: 'SKU 360', panels: [
    panel('timeline', 'Timeline', 'entity-timeline'),
    panel('distribution', 'Distribution', 'distribution-kpi'),
    panel('sales', 'Sales', 'erp_invoice_lines'),
    panel('returns', 'Returns', 'returns'),
    panel('near_expiry', 'Near Expiry', 'near-expiry'),
    panel('promotions', 'Promotions', 'attribution'),
    panel('pricing', 'Pricing', 'commercial/pricing'),
    panel('msl_oos', 'MSL / OOS', 'msl-matrix'),
    panel('forecast', 'Forecast', 'commercial/forecasting', false),
    panel('profitability', 'Profitability', 'attribution', false),
  ] },
  { entity: 'category', label: 'Category 360', panels: [
    panel('distribution', 'Distribution', 'distribution-kpi'),
    panel('sales', 'Sales', 'erp_invoice_lines'),
    panel('promotions', 'Promotions', 'attribution'),
    panel('perfect_store', 'Perfect Store', 'perfect-store'),
  ] },
  { entity: 'brand', label: 'Brand 360', panels: [
    panel('distribution', 'Distribution', 'distribution-kpi'),
    panel('sales', 'Sales', 'erp_invoice_lines'),
    panel('promotions', 'Promotions', 'attribution'),
    panel('returns', 'Returns', 'returns'),
  ] },
  { entity: 'salesman', label: 'Salesman 360', panels: [
    panel('scorecard', 'Scorecard', 'coverage/scorecard'),
    panel('coverage', 'Coverage & Strike', 'coverage/kpi'),
    panel('targets', 'Targets', 'commercial/targets'),
    panel('collections', 'Collections', 'collections'),
    panel('route_riding', 'Route Riding', 'route-riding'),
    panel('incentives', 'Incentives & Commission', 'attribution'),
    panel('returns_impact', 'Returns Impact', 'returns'),
    panel('ownership', 'Ownership History', 'ownership'),
  ] },
  { entity: 'supervisor', label: 'Supervisor 360', panels: [
    panel('team', 'Team Performance', 'route-riding/analytics'),
    panel('coaching', 'Coaching', 'route-riding'),
    panel('coverage', 'Team Coverage', 'coverage/kpi'),
    panel('ownership', 'Ownership History', 'ownership'),
  ] },
  { entity: 'area_manager', label: 'Area Manager 360', panels: [
    panel('supervisors', 'Supervisor Effectiveness', 'route-riding/analytics'),
    panel('coverage', 'Area Coverage', 'coverage/kpi'),
    panel('territory', 'Territory Performance', 'route-optimization/analytics'),
  ] },
  { entity: 'region', label: 'Region 360', panels: [
    panel('territory', 'Territory Performance', 'route-optimization/analytics'),
    panel('sales', 'Sales', 'distribution/sales-summary'),
    panel('coverage', 'Coverage', 'coverage/kpi'),
  ] },
  { entity: 'route', label: 'Route 360', panels: [
    panel('compliance', 'Route Compliance', 'coverage/kpi'),
    panel('balancing', 'Balancing', 'route-optimization/balancing'),
    panel('revenue', 'Revenue', 'route-optimization/analytics'),
    panel('ownership', 'Ownership History', 'ownership'),
  ] },
  { entity: 'promotion', label: 'Promotion 360', panels: [
    panel('profitability', 'Profitability', 'attribution'),
    panel('roi', 'ROI', 'trade-spend/roi'),
    panel('claims', 'Claims', 'trade-spend/claims'),
    panel('returns_impact', 'Returns Impact', 'attribution'),
    panel('closure', 'Closure Report', 'promotion/closure'),
  ] },
];

/** Look up a 360 profile by entity type. Pure. */
export function getProfile(entity: Entity360Type): Entity360Profile | undefined {
  return ENTITY_360_PROFILES.find((p) => p.entity === entity);
}
