// Global Tax (Phase 5) feature flag. Default OFF — the tax engine (codes/groups/
// determination/ledger/posting) is additive and inert until enabled. Mirrors
// KAKO_FINANCE / KAKO_TRADE_SPEND. Country packs gate separately (KAKO_TAX_<CC>).
const on = (v: string | undefined): boolean => v === '1' || v === 'true';

/** Global Tax engine flag (default OFF). */
export const TAX_ENABLED = (): boolean => on(process.env.KAKO_TAX);

// ── Country pack flags (each default OFF; a pack runs only when its flag is on) ──
/** Egypt ETA pack flag (default OFF). */
export const TAX_EG_ENABLED = (): boolean => on(process.env.KAKO_TAX_EG);
/** Saudi ZATCA pack flag (default OFF). */
export const TAX_SA_ENABLED = (): boolean => on(process.env.KAKO_TAX_SA);
/** UAE FTA pack flag (default OFF). */
export const TAX_AE_ENABLED = (): boolean => on(process.env.KAKO_TAX_AE);
/** Bahrain NBR pack flag (default OFF). */
export const TAX_BH_ENABLED = (): boolean => on(process.env.KAKO_TAX_BH);
/** Oman OTA pack flag (default OFF). */
export const TAX_OM_ENABLED = (): boolean => on(process.env.KAKO_TAX_OM);
/** Kuwait pack flag (default OFF; future tax readiness). */
export const TAX_KW_ENABLED = (): boolean => on(process.env.KAKO_TAX_KW);
