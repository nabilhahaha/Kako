// ============================================================================
// Promotion Platform — budget control (Phase 4+). Pure. Annual/quarterly/monthly
// budgets with planned / committed / actual / remaining and overspend prevention.
// No I/O.
// ============================================================================

export type BudgetPeriodKind = 'annual' | 'quarterly' | 'monthly';

export interface BudgetState {
  amount: number;       // total budget
  committed: number;    // approved-but-unspent (e.g. active promos)
  actual: number;       // spent (claims settled)
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Remaining = amount − committed − actual. Pure. */
export function remainingBudget(b: BudgetState): number {
  return round2(b.amount - b.committed - b.actual);
}

export interface SpendCheck {
  allowed: boolean;
  remainingBefore: number;
  remainingAfter: number;
  overBy: number;
}

/** Check whether committing/spending `amount` is within budget (prevent overspend). Pure. */
export function checkSpend(b: BudgetState, amount: number): SpendCheck {
  const remainingBefore = remainingBudget(b);
  const remainingAfter = round2(remainingBefore - amount);
  return {
    allowed: remainingAfter >= 0,
    remainingBefore,
    remainingAfter,
    overBy: remainingAfter < 0 ? round2(-remainingAfter) : 0,
  };
}

/** Utilisation % = (committed + actual) / amount × 100. Pure. */
export function utilisationPct(b: BudgetState): number {
  return b.amount > 0 ? Math.round(((b.committed + b.actual) / b.amount) * 100) : 0;
}
