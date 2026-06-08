// Route Optimization & Territory Planning module (Phase 3 FMCG) feature flag.
// Default OFF — the engine (optimization/balancing/territory/frequency/maps/
// recommendations/analytics) is additive and inert until enabled.
const on = (v: string | undefined): boolean => v === '1' || v === 'true';

/** Route Optimization module flag (default OFF). */
export const ROUTE_OPTIMIZATION_ENABLED = (): boolean => on(process.env.KAKO_ROUTE_OPTIMIZATION);
