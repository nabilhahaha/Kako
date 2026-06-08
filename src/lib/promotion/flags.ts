// Enterprise Promotion Platform (Phase 4+) feature flag. Default OFF — the
// platform layer (targeting/funding/incentives/commissions/requests/budgets/
// closure) is additive and inert until enabled. Extends the existing trade-spend
// engines (KAKO_TRADE_SPEND); GL posting still gates on KAKO_FINANCE.
const on = (v: string | undefined): boolean => v === '1' || v === 'true';

/** Enterprise Promotion Platform flag (default OFF). */
export const PROMOTIONS_ENABLED = (): boolean => on(process.env.KAKO_PROMOTIONS);
