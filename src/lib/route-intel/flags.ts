// Route & Territory Intelligence (Phase 7D) feature flag. Default OFF — the health-
// score engine + multi-level dashboards are additive and inert until enabled.
// Reuses coverage KPIs, the rep-day KPI snapshots (0193), and the pillar scorer.
const on = (v: string | undefined): boolean => v === '1' || v === 'true';

/** Route & Territory Intelligence flag (default OFF). */
export const ROUTE_INTEL_ENABLED = (): boolean => on(process.env.KAKO_ROUTE_INTEL);
