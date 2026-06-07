// Distribution (Phase 3 — Sales / FMCG) feature flags. Default OFF — collection
// settlement, journey adherence, van manifest, supervisor KPI enhancements are
// additive and inert until enabled. Mirrors KAKO_FINANCE / KAKO_PURCHASING.
const on = (v: string | undefined): boolean => v === '1' || v === 'true';

/** Sales/FMCG distribution enhancements flag (default OFF). */
export const DISTRIBUTION_ENABLED = (): boolean => on(process.env.KAKO_DISTRIBUTION);
