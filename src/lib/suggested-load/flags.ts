// Suggested Load & Demand Engine (Phase 7E) feature flag. Default OFF — the
// demand projection + suggested-load + van-utilization engine is additive and
// inert until enabled. Reuses the Phase-6B forecasting engine + van manifest (0194).
const on = (v: string | undefined): boolean => v === '1' || v === 'true';

/** Suggested Load & Demand flag (default OFF). */
export const SUGGESTED_LOAD_ENABLED = (): boolean => on(process.env.KAKO_SUGGESTED_LOAD);
