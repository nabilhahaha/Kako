// Perfect Store Engine (Phase 7C) feature flag. Default OFF — the configurable
// scorecard layer (channel/region/customer-type weighted scoring, snapshots,
// leaderboards, trends) is additive and inert until enabled. Reuses the existing
// perfect-store pillar scorer (src/lib/erp/perfect-store.ts).
const on = (v: string | undefined): boolean => v === '1' || v === 'true';

/** Perfect Store Engine flag (default OFF). */
export const PERFECT_STORE_ENABLED = (): boolean => on(process.env.KAKO_PERFECT_STORE);
