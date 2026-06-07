// ============================================================================
// Purchasing — AP aging (Phase 2). Pure: turns AP sub-ledger entries into aging
// buckets as of a reference date, by the entry's due date (falling back to
// doc date). Signed amounts net (bills +, payments/returns −); only the
// outstanding positive balance per bucket is reported. No DB.
// ============================================================================

export interface ApLedgerEntry {
  amount: number;          // signed: + bill, − payment/return
  dueDate?: string | null; // ISO; falls back to docDate when absent
  docDate: string;         // ISO
}

export interface AgingBuckets {
  current: number;   // not yet due
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d90_plus: number;
  total: number;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const daysBetween = (a: string, b: string): number =>
  Math.floor((Date.parse(a) - Date.parse(b)) / 86_400_000);

/** Bucket outstanding AP by age as of `asOf` (ISO date). Net balance is allocated
 *  newest-debt-first is NOT assumed — we age each entry by its own due date, then
 *  net payments against the total; the result reflects gross aged exposure with a
 *  net total. (Sufficient for a summary; per-invoice settlement is a later step.) */
export function ageAp(entries: ApLedgerEntry[], asOf: string): AgingBuckets {
  const b: AgingBuckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, total: 0 };
  for (const e of entries) {
    if (e.amount <= 0) { b.total = round2(b.total + e.amount); continue; } // payments/returns reduce total
    const ref = e.dueDate ?? e.docDate;
    const overdue = daysBetween(asOf, ref);
    if (overdue <= 0) b.current = round2(b.current + e.amount);
    else if (overdue <= 30) b.d1_30 = round2(b.d1_30 + e.amount);
    else if (overdue <= 60) b.d31_60 = round2(b.d31_60 + e.amount);
    else if (overdue <= 90) b.d61_90 = round2(b.d61_90 + e.amount);
    else b.d90_plus = round2(b.d90_plus + e.amount);
    b.total = round2(b.total + e.amount);
  }
  return b;
}
