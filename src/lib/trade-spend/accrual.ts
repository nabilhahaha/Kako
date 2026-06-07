// ============================================================================
// Trade Spend — accrual engine (Phase 4). Pure, no DB. Computes the trade-spend
// liability a promotion accrues for a period from its terms + sales actuals:
//   * percent_of_sales — accrued = salesValue × percent%
//   * rate_per_unit    — accrued = units × rate (e.g. EGP/case)
//   * lump_sum         — a one-time fixed accrual (only the first time)
// An optional cap limits CUMULATIVE accrual (prior + new never exceeds the cap).
//
// Data-integrity invariants (tested): never negative; cumulative accrual never
// exceeds the cap; lump-sum accrues exactly once. The amount produced here is what
// the GL posts (Dr promo expense / Cr accrued trade-spend) when wired — amount-
// agnostic GL, same as costing/COGS.
// ============================================================================

export type AccrualMethod = 'percent_of_sales' | 'rate_per_unit' | 'lump_sum';

export interface AccrualTerms {
  method: AccrualMethod;
  /** percent_of_sales: percentage (e.g. 5 = 5%). */
  percent?: number;
  /** rate_per_unit: amount per unit/case. */
  rate?: number;
  /** lump_sum: the fixed total. */
  lumpSum?: number;
  /** Optional cap on the CUMULATIVE accrual across the promotion. */
  cap?: number;
}

export interface SalesActuals {
  salesValue: number; // ex-VAT sales value in the period
  units: number;      // units/cases in the period
}

export interface AccrualResult {
  accrued: number;     // accrual to book THIS period (post-cap)
  uncapped: number;    // what it would have been before the cap
  capped: boolean;     // true if the cap clamped it
  method: AccrualMethod;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Compute the period accrual. `priorAccrued` = accrual already booked for this
 *  promotion (for cap enforcement + lump-sum once-only). Pure. */
export function computeAccrual(terms: AccrualTerms, actuals: SalesActuals, priorAccrued = 0): AccrualResult {
  let raw = 0;
  switch (terms.method) {
    case 'percent_of_sales':
      raw = Math.max(0, actuals.salesValue) * Math.max(0, terms.percent ?? 0) / 100;
      break;
    case 'rate_per_unit':
      raw = Math.max(0, actuals.units) * Math.max(0, terms.rate ?? 0);
      break;
    case 'lump_sum':
      // Booked once: if anything already accrued, no further lump-sum.
      raw = priorAccrued > 0 ? 0 : Math.max(0, terms.lumpSum ?? 0);
      break;
  }
  const uncapped = round2(raw);

  let accrued = uncapped;
  let capped = false;
  if (terms.cap != null) {
    const headroom = round2(Math.max(0, terms.cap - Math.max(0, priorAccrued)));
    if (uncapped > headroom) {
      accrued = headroom;
      capped = true;
    }
  }
  return { accrued: round2(accrued), uncapped, capped, method: terms.method };
}
