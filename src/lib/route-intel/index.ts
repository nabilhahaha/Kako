// ============================================================================
// Route & Territory Intelligence (Phase 7D) — public surface. Route / salesman /
// territory health scores + multi-level dashboards over operational history.
// Additive, flag-gated (KAKO_ROUTE_INTEL, default OFF), multi-tenant safe,
// reuse-first. Reuses coverage KPIs, the rep-day KPI snapshots (0193), the pillar
// scorer, route-optimization analytics (0214/0215), and ownership (0214) for
// execution-time attribution. Persisted in erp_intel_health_snapshots for trends.
// ============================================================================

export * from './flags';
export * from './health';
export * from './dashboards';
