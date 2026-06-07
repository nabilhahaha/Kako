// Trade Spend (Phase 4) feature flag. Default OFF — accrual/claims/ROI/GL are
// additive and inert until enabled. Mirrors KAKO_FINANCE / KAKO_DISTRIBUTION.
const on = (v: string | undefined): boolean => v === '1' || v === 'true';

/** Trade-spend module flag (default OFF). */
export const TRADE_SPEND_ENABLED = (): boolean => on(process.env.KAKO_TRADE_SPEND);
