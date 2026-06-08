// Route Riding Excellence module (Phase 3 FMCG) feature flag. Default OFF — the
// module (planning/execution/evaluation/scoring/coaching/acknowledgement/analytics)
// is additive and inert until enabled. Mirrors KAKO_DISTRIBUTION / KAKO_TRADE_SPEND.
const on = (v: string | undefined): boolean => v === '1' || v === 'true';

/** Route Riding module flag (default OFF). */
export const ROUTE_RIDING_ENABLED = (): boolean => on(process.env.KAKO_ROUTE_RIDING);
