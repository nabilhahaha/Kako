/** ── FX rates — provider revenue normalization ─────────────────────────────
 *
 *  The Platform Owner cockpit shows ONE executive revenue number (MRR/ARR) in a
 *  single base currency, plus a per-currency breakdown that never hides the
 *  source amounts.
 *
 *  ARCHITECTURE NOTE (intentional, do not inline rates at call sites):
 *  Rates are read through the async accessor `getFxRates()`. Today it returns a
 *  temporary in-code config table. The accessor is the ONLY seam — when FX rates
 *  move to the planned screen (Platform Owner → Settings → FX Rates: editable
 *  rates, effective date, change audit, historical lookup), only the body of
 *  `getFxRates()` changes (e.g. read `erp_fx_rates` for the latest effective row).
 *  Every caller — the overview cockpit, future invoices/reports — keeps working
 *  unchanged. Keep callers `await getFxRates()`; never import the constant.
 */

export interface FxRateTable {
  /** Base currency every amount is normalized into. */
  base: string;
  /** Date these rates took effect (ISO yyyy-mm-dd). Surfaced as "as of …". */
  effectiveDate: string;
  /** SAR value of ONE unit of each currency (base maps to 1). */
  rates: Record<string, number>;
  /** Provenance — lets the UI label rates as indicative until DB-managed. */
  source: 'config' | 'platform-settings';
}

export const FX_BASE_CURRENCY = 'SAR';

/** Temporary config table (indicative). Replaced by platform-managed rates in a
 *  later phase — see the architecture note above. Update here for now. */
const CONFIG_FX: FxRateTable = {
  base: FX_BASE_CURRENCY,
  effectiveDate: '2026-06-01',
  source: 'config',
  rates: {
    SAR: 1,
    AED: 1.02,
    KWD: 12.2,
    QAR: 1.03,
    BHD: 9.95,
    OMR: 9.74,
    EGP: 0.078,
    USD: 3.75,
  },
};

/** Single seam for rate retrieval. Async on purpose so a DB-backed source can be
 *  dropped in without changing call sites. */
export async function getFxRates(): Promise<FxRateTable> {
  return CONFIG_FX;
}

/** Convert a major-unit amount to the base currency. Returns null when no rate
 *  is configured for the currency, so callers can surface "unrated" instead of
 *  silently treating it as 1:1. */
export function convertToBase(amountMajor: number, currency: string, fx: FxRateTable): number | null {
  if (currency === fx.base) return amountMajor;
  const rate = fx.rates[currency];
  return rate == null ? null : amountMajor * rate;
}
