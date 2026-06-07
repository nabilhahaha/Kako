// Global Tax (Phase 5) feature flag. Default OFF — the tax engine (codes/groups/
// determination/ledger/posting) is additive and inert until enabled. Mirrors
// KAKO_FINANCE / KAKO_TRADE_SPEND. Country packs gate separately (KAKO_TAX_<CC>).
const on = (v: string | undefined): boolean => v === '1' || v === 'true';

/** Global Tax engine flag (default OFF). */
export const TAX_ENABLED = (): boolean => on(process.env.KAKO_TAX);
