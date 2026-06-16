// Return Approval — PURE, RULES-DRIVEN policy resolution (no I/O). The company
// configures: a MODE (disabled / open / approval) + an ordered list of RULES. Each
// rule matches on any combination of dimensions (return type, value band, customer,
// customer class, salesman, route, product category) and yields a decision
// (auto / approval / block). The first matching active rule (by priority) wins; with
// no match, the MODE default applies (open → auto, approval → approval). Nothing is
// hardcoded — every example (saleable ≤500 auto / >500 approval, damage always
// approval, VIP always approval) is expressed as data. Flag: platform.return_approval.

export type ReturnDecision = 'auto' | 'approval' | 'block';
export type PolicyMode = 'disabled' | 'open' | 'approval';
export type ReturnTypeKind = 'saleable' | 'damage';
export type ApprovalLevel = 'supervisor' | 'branch_manager' | 'company_admin';

/** What we know about a return when resolving its policy. */
export interface ReturnContext {
  returnType: ReturnTypeKind;
  value: number;
  customerId?: string | null;
  customerClass?: string | null;
  salesmanId?: string | null;
  routeId?: string | null;
  productCategoryIds?: string[];
}

/** One configurable rule. All set (non-null) criteria must match (AND). */
export interface ReturnRule {
  priority: number;
  active?: boolean;
  returnType?: ReturnTypeKind | null;
  minValue?: number | null;          // inclusive lower bound on value
  maxValue?: number | null;          // inclusive upper bound on value
  customerId?: string | null;
  customerClass?: string | null;
  salesmanId?: string | null;
  routeId?: string | null;
  productCategoryId?: string | null; // matches when the return contains this category
  result: ReturnDecision;
  approverLevel?: ApprovalLevel | null;
}

export interface ReturnApprovalPolicy {
  mode: PolicyMode;
  rules: ReturnRule[];
  /** Default approver when a rule doesn't specify one. */
  approverRole?: ApprovalLevel | null;
}

/** The default (pilot) policy = Open with no rules: everything auto-posts. */
export const DEFAULT_RETURN_POLICY: ReturnApprovalPolicy = { mode: 'open', rules: [], approverRole: 'supervisor' };

/** Does a rule match the return context? All non-null criteria must hold. Pure. */
export function ruleMatches(rule: ReturnRule, ctx: ReturnContext): boolean {
  if (rule.returnType && rule.returnType !== ctx.returnType) return false;
  if (rule.minValue != null && Number(ctx.value) < Number(rule.minValue)) return false;
  if (rule.maxValue != null && Number(ctx.value) > Number(rule.maxValue)) return false;
  if (rule.customerId && rule.customerId !== ctx.customerId) return false;
  if (rule.customerClass && rule.customerClass !== ctx.customerClass) return false;
  if (rule.salesmanId && rule.salesmanId !== ctx.salesmanId) return false;
  if (rule.routeId && rule.routeId !== ctx.routeId) return false;
  if (rule.productCategoryId && !(ctx.productCategoryIds ?? []).includes(rule.productCategoryId)) return false;
  return true;
}

export interface ReturnResolution {
  decision: ReturnDecision;
  approver: ApprovalLevel;
  /** Index of the matched rule (by priority order), or null when the mode default applied. */
  matchedRule: number | null;
}

/**
 * Resolve the decision for a return. Pure.
 *   • mode 'disabled'              → block
 *   • first matching active rule   → its result (+ approver)
 *   • no rule matches              → mode default (open → auto, approval → approval)
 */
export function resolveReturnDecision(ctx: ReturnContext, policy: ReturnApprovalPolicy): ReturnResolution {
  const fallbackApprover = policy.approverRole ?? 'supervisor';
  if (policy.mode === 'disabled') return { decision: 'block', approver: fallbackApprover, matchedRule: null };

  const rules = (policy.rules ?? [])
    .filter((r) => r.active !== false)
    .sort((a, b) => a.priority - b.priority);
  for (let i = 0; i < rules.length; i++) {
    if (ruleMatches(rules[i], ctx)) {
      return { decision: rules[i].result, approver: rules[i].approverLevel ?? fallbackApprover, matchedRule: i };
    }
  }
  const def: ReturnDecision = policy.mode === 'approval' ? 'approval' : 'auto';
  return { decision: def, approver: fallbackApprover, matchedRule: null };
}

/** Is the Return Approval workflow active for this tenant? (`platform.return_approval`). Pure. */
export function returnApprovalEnabled(flags: Record<string, boolean | undefined> | null | undefined): boolean {
  return Boolean(flags?.['platform.return_approval']);
}
