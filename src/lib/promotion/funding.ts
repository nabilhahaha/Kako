// ============================================================================
// Promotion Platform — funding split engine (Phase 4+). Pure. Splits a promotion's
// cost across funding sources (supplier / company / distributor / shared) by
// configurable percentages (100, 50/50, custom). Validates the split = 100% and
// supports proportional reversal when a return claws back part of the cost.
// ============================================================================

export type FundingSourceType = 'supplier' | 'company' | 'distributor';

export interface FundingShare {
  source: FundingSourceType;
  percent: number;   // 0..100
}

export interface FundingAllocation {
  source: FundingSourceType;
  percent: number;
  amount: number;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** True when the shares sum to 100% (±0.01). Pure. */
export function isValidSplit(shares: readonly FundingShare[]): boolean {
  return Math.abs(shares.reduce((s, x) => s + x.percent, 0) - 100) < 0.01;
}

/** Allocate `totalCost` across the funding shares (last absorbs rounding). Pure. */
export function allocateFunding(totalCost: number, shares: readonly FundingShare[]): FundingAllocation[] {
  const out: FundingAllocation[] = shares.map((s) => ({ source: s.source, percent: s.percent, amount: round2(totalCost * s.percent / 100) }));
  const drift = round2(totalCost - out.reduce((s, x) => s + x.amount, 0));
  if (out.length && drift !== 0) out[out.length - 1].amount = round2(out[out.length - 1].amount + drift);
  return out;
}

/** Reverse a portion of each funding allocation (proportional to a return). Pure. */
export function reverseFunding(allocations: readonly FundingAllocation[], reversalRatio: number): FundingAllocation[] {
  const r = Math.max(0, Math.min(1, reversalRatio));
  return allocations.map((a) => ({ ...a, amount: round2(a.amount * r) }));
}
