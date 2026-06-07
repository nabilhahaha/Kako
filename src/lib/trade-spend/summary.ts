// ============================================================================
// Trade Spend — summary read-model (Phase 4). Pure, no DB. Rolls promotions (with
// their accrued + claimed totals) into the headline KPIs a trade-marketing manager
// monitors: total accrued liability, total claimed/settled, OPEN liability still
// owed, cap utilisation, and over-claim exposure. Reads existing data; computes
// nothing into the DB.
// ============================================================================

export interface PromoSummaryRow {
  status: string;          // draft|active|closed|cancelled
  accrued: number;         // sum of accruals for the promo
  claimed: number;         // sum of claim allocations against the promo
  cap: number | null;      // promo cap (if any)
}

export interface TradeSpendSummary {
  promotions: number;
  active: number;
  totalAccrued: number;
  totalClaimed: number;
  openLiability: number;     // accrued − claimed (>= 0 floor)
  capUtilizationPct: number; // accrued / total cap, where caps are set (0 if none)
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const pct = (num: number, den: number): number => (den <= 0 ? 0 : Math.round((num / den) * 1000) / 10);

/** Aggregate promotion rows into the trade-spend KPI summary. Pure. */
export function summarizeTradeSpend(rows: PromoSummaryRow[]): TradeSpendSummary {
  let totalAccrued = 0, totalClaimed = 0, capTotal = 0, accruedUnderCap = 0, active = 0;
  for (const r of rows) {
    const accrued = Math.max(0, r.accrued);
    const claimed = Math.max(0, r.claimed);
    totalAccrued += accrued;
    totalClaimed += claimed;
    if (r.status === 'active') active++;
    if (r.cap != null && r.cap > 0) { capTotal += r.cap; accruedUnderCap += accrued; }
  }
  return {
    promotions: rows.length,
    active,
    totalAccrued: round2(totalAccrued),
    totalClaimed: round2(totalClaimed),
    openLiability: round2(Math.max(0, totalAccrued - totalClaimed)),
    capUtilizationPct: pct(accruedUnderCap, capTotal),
  };
}
