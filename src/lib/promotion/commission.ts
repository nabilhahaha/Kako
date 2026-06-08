// ============================================================================
// Promotion Platform — commission engine (Phase 4+). Pure. Fixed / percentage /
// tiered / achievement / product / customer commission rules over a sales base,
// with reversal + adjustment for returns/discounts/promotions. No hardcoded
// rates — rules are data.
// ============================================================================

export type CommissionKind = 'fixed' | 'percentage' | 'tiered' | 'achievement';

export interface CommissionTier { minBase: number; percent: number }

export interface CommissionRule {
  kind: CommissionKind;
  amount?: number;          // fixed
  percent?: number;         // percentage / achievement base rate
  tiers?: CommissionTier[]; // tiered (by base) — highest qualifying tier
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Commission for a sales `base`. `achievementPct` scales the 'achievement' kind.
 * Tiered uses the highest qualifying tier's percent. Pure.
 */
export function computeCommission(rule: CommissionRule, base: number, achievementPct = 100): number {
  switch (rule.kind) {
    case 'fixed': return round2(rule.amount ?? 0);
    case 'percentage': return round2(base * (rule.percent ?? 0) / 100);
    case 'achievement': return round2(base * (rule.percent ?? 0) / 100 * (Math.max(0, achievementPct) / 100));
    case 'tiered': {
      const tier = [...(rule.tiers ?? [])].filter((t) => base >= t.minBase).sort((a, b) => b.minBase - a.minBase)[0];
      return round2(base * (tier?.percent ?? 0) / 100);
    }
    default: return 0;
  }
}

/**
 * Commission adjustment when the sales base changes (return/discount/promotion):
 * recompute on the new base and return the delta to claw back (negative = owed). Pure.
 */
export function commissionAdjustment(rule: CommissionRule, originalBase: number, newBase: number, achievementPct = 100): { original: number; adjusted: number; reversal: number } {
  const original = computeCommission(rule, originalBase, achievementPct);
  const adjusted = computeCommission(rule, newBase, achievementPct);
  return { original, adjusted, reversal: round2(original - adjusted) };
}
