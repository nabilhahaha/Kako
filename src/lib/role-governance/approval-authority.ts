// ============================================================================
// Role Governance — approval authority engine (Phase 7). Pure. Resolves WHO may
// approve based on configurable thresholds by amount / discount% / credit limit /
// promotion budget (and optional region/customer-type qualifiers). Example:
// discount >10% → area_manager, >20% → regional_manager, >30% → gm. No hardcoded
// thresholds — rules are data. No I/O.
// ============================================================================

export type ApprovalDimension = 'amount' | 'discount_pct' | 'credit_limit' | 'promotion_budget';

export interface ApprovalRule {
  dimension: ApprovalDimension;
  threshold: number;          // value strictly above which this authority is required
  authorityRole: string;      // role/level that must approve
  region?: string | null;     // optional qualifier
  customerType?: string | null;
}

export interface ApprovalContext {
  dimension: ApprovalDimension;
  value: number;
  region?: string | null;
  customerType?: string | null;
}

export interface ApprovalRequirement {
  required: boolean;
  authorityRole: string | null;
  matchedThreshold: number | null;
}

/**
 * Resolve the required approval authority: among rules for the dimension whose
 * threshold the value exceeds (and qualifiers match), pick the HIGHEST threshold
 * (most senior). Pure.
 */
export function resolveApprovalAuthority(rules: readonly ApprovalRule[], ctx: ApprovalContext): ApprovalRequirement {
  const matching = rules
    .filter((r) => r.dimension === ctx.dimension && ctx.value > r.threshold)
    .filter((r) => (r.region == null || r.region === ctx.region) && (r.customerType == null || r.customerType === ctx.customerType))
    .sort((a, b) => b.threshold - a.threshold);
  const top = matching[0];
  return top ? { required: true, authorityRole: top.authorityRole, matchedThreshold: top.threshold } : { required: false, authorityRole: null, matchedThreshold: null };
}
