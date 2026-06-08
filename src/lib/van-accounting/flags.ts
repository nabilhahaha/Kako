// Route Accounting & Van Operations module (Phase 7A) feature flag. Default OFF —
// the engine (opening balance / expenses / cash + inventory reconciliation / route
// P&L / van statement) is additive and inert until enabled. GL posting of expenses
// / variances reuses the Phase-1 poster and additionally gates on KAKO_FINANCE.
const on = (v: string | undefined): boolean => v === '1' || v === 'true';

/** Route Accounting & Van Operations flag (default OFF). */
export const VAN_ACCOUNTING_ENABLED = (): boolean => on(process.env.KAKO_VAN_ACCOUNTING);
