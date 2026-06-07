// ============================================================================
// Trade Spend — claims / deductions settlement engine (Phase 4). Pure, no DB.
// A customer submits a claim (or takes a deduction off an invoice) for promo
// money owed; this matches it against the ACCRUED-but-unclaimed balance of the
// customer's promotions — oldest-first or caller-specified — and reports any
// portion with NO accrual backing as `overClaim` (a deduction the company never
// accrued for → dispute/hold). Mirrors the collection-allocation + 3-way-match
// engines.
//
// Data-integrity invariants (tested): never settle more than a promotion's
// accrued balance; never allocate more than the claim amount; unbacked claim is
// surfaced as overClaim (never silently absorbed).
// ============================================================================

export interface AccruedPromo {
  id: string;
  accruedBalance: number; // accrued-but-unclaimed amount available to settle
  date: string;           // ISO — promo/accrual date for oldest-first ordering
}

export interface ClaimAllocation {
  promoId: string;
  applied: number;
}

export interface ClaimSettlementResult {
  allocations: ClaimAllocation[];
  totalApplied: number;
  overClaim: number;          // claim amount with no accrual backing (dispute/hold)
  fullyConsumed: string[];    // promo ids whose accrued balance is now fully claimed
}

export interface SettleClaimOptions {
  /** Explicit per-promo amounts; otherwise oldest-first. */
  specified?: Record<string, number>;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Settle a claim/deduction against accrued promo balances. Pure. */
export function settleClaim(
  claimAmount: number,
  promos: AccruedPromo[],
  opts: SettleClaimOptions = {},
): ClaimSettlementResult {
  const available = promos.filter((p) => p.accruedBalance > 0);
  const amount = round2(Math.max(0, claimAmount));

  const allocations: ClaimAllocation[] = [];
  const fullyConsumed: string[] = [];

  if (opts.specified) {
    let budget = amount;
    const byId = new Map(available.map((p) => [p.id, p]));
    for (const [promoId, raw] of Object.entries(opts.specified)) {
      const p = byId.get(promoId);
      if (!p || raw <= 0 || budget <= 0) continue;
      const applied = round2(Math.min(raw, p.accruedBalance, budget));
      if (applied <= 0) continue;
      allocations.push({ promoId, applied });
      if (applied >= p.accruedBalance - Number.EPSILON) fullyConsumed.push(promoId);
      budget = round2(budget - applied);
    }
  } else {
    const ordered = [...available].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1));
    let remaining = amount;
    for (const p of ordered) {
      if (remaining <= 0) break;
      const applied = round2(Math.min(remaining, p.accruedBalance));
      if (applied <= 0) continue;
      allocations.push({ promoId: p.id, applied });
      if (applied >= p.accruedBalance - Number.EPSILON) fullyConsumed.push(p.id);
      remaining = round2(remaining - applied);
    }
  }

  const totalApplied = round2(allocations.reduce((s, a) => s + a.applied, 0));
  return { allocations, totalApplied, overClaim: round2(amount - totalApplied), fullyConsumed };
}
