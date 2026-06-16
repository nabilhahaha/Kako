// Visit cockpit — recommended next action. A pure, priority-ordered rule engine
// that turns the customer's signals into ONE clear suggestion so the cockpit
// guides the rep, not just informs. No I/O; unit-testable.

export type RecommendedAction =
  | 'process_return'      // open return requests → handle them first
  | 'collection'          // overdue balance → collect
  | 'collect_before_sell' // at/over credit limit → collect before a new sale
  | 'reactivation'        // lapsed (no purchase for N days) → reactivation sale
  | 'new_sale';           // active & healthy → sell

export interface RecoSignals {
  /** Customer has open/pending return requests. */
  hasOpenReturnRequests?: boolean;
  /** Overdue receivables amount. */
  overdueAmount: number;
  /** Available credit (limit − balance); ≤ 0 means at/over the limit. */
  availableCredit: number;
  /** Credit limit (0 = cash-only / no limit set). */
  creditLimit: number;
  /** Days since the last purchase; null = never purchased. */
  daysSinceLastPurchase: number | null;
  /** Lapsed threshold in days (default 45). */
  lapsedDays?: number;
}

/** Whole-day difference between two YYYY-MM-DD dates (null-safe). */
export function daysSince(iso: string | null | undefined, todayIso: string): number | null {
  if (!iso) return null;
  const d = Math.floor((Date.parse(`${todayIso}T00:00:00Z`) - Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`)) / 86_400_000);
  return Math.max(0, d);
}

/** The single recommended next action (priority order, most urgent first). */
export function recommendAction(s: RecoSignals): RecommendedAction {
  const lapse = s.lapsedDays ?? 45;
  if (s.hasOpenReturnRequests) return 'process_return';
  if (s.overdueAmount > 0) return 'collection';
  if (s.creditLimit > 0 && s.availableCredit <= 0) return 'collect_before_sell';
  if (s.daysSinceLastPurchase != null && s.daysSinceLastPurchase >= lapse) return 'reactivation';
  return 'new_sale';
}

/** Which transaction the recommendation maps to (drives the cockpit CTA). */
export function recommendedKind(action: RecommendedAction): 'sell' | 'collect' | 'return' {
  switch (action) {
    case 'process_return': return 'return';
    case 'collection':
    case 'collect_before_sell': return 'collect';
    case 'reactivation':
    case 'new_sale': return 'sell';
  }
}
