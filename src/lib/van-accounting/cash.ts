// ============================================================================
// Route Accounting — cash reconciliation (Phase 7A). Pure. Reconciles a van/route
// day's cash: expected = opening + cash sales + cash collections − cash returns −
// expenses; variance = counted − expected → shortage / overage / balanced (driver
// accountability). No I/O.
// ============================================================================

export interface CashReconInput {
  openingCash: number;
  cashSales: number;
  cashCollections: number;
  cashReturns: number;     // cash refunded to customers on returns
  expenses: number;        // route expenses paid from the cash box
  countedCash: number;     // physically counted at day close
}

export type CashReconStatus = 'shortage' | 'overage' | 'balanced';

export interface CashReconResult {
  expectedCash: number;
  countedCash: number;
  variance: number;        // counted − expected (negative = shortage)
  shortage: number;        // positive amount short (0 if not short)
  overage: number;         // positive amount over (0 if not over)
  status: CashReconStatus;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Reconcile the cash box for a van/route day. Pure. */
export function reconcileCash(i: CashReconInput, tolerance = 0.01): CashReconResult {
  const expectedCash = round2(i.openingCash + i.cashSales + i.cashCollections - i.cashReturns - i.expenses);
  const variance = round2(i.countedCash - expectedCash);
  const status: CashReconStatus = Math.abs(variance) <= tolerance ? 'balanced' : variance < 0 ? 'shortage' : 'overage';
  return {
    expectedCash,
    countedCash: round2(i.countedCash),
    variance,
    shortage: variance < -tolerance ? round2(-variance) : 0,
    overage: variance > tolerance ? round2(variance) : 0,
    status,
  };
}
