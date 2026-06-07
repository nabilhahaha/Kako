// ============================================================================
// Finance Foundation — posting-rule resolver (Phase 1, pure / unit-testable).
// Selects the matching rule for a source event and turns its line templates into
// balanced draft journal lines. No DB, no I/O — "rules are data, not code".
// ============================================================================

import type { PostingRule, PostingContext, ResolvedLine } from './types';

/** Rounding tolerance for the balance check (currency at 2dp; allow float dust). */
const EPSILON = 0.005;

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Does a rule's equality `condition` match the context attributes? Empty = match-all. */
export function conditionMatches(rule: PostingRule, ctx: PostingContext): boolean {
  const cond = rule.condition ?? {};
  const attrs = ctx.attributes ?? {};
  for (const [k, v] of Object.entries(cond)) {
    if (attrs[k] !== v) return false;
  }
  return true;
}

/** Pick active rules for an event whose condition matches, ordered by priority
 *  then preferring company-specific over the global default. */
export function selectRules(rules: PostingRule[], sourceEvent: string, ctx: PostingContext): PostingRule[] {
  return rules
    .filter((r) => r.isActive && r.sourceEvent === sourceEvent && conditionMatches(r, ctx))
    .sort((a, b) => (a.priority - b.priority) || ((b.companyId ? 1 : 0) - (a.companyId ? 1 : 0)));
}

/** The single rule to apply for an event: most-specific (company) at the lowest
 *  priority. Returns null if none match. */
export function resolveRule(rules: PostingRule[], sourceEvent: string, ctx: PostingContext): PostingRule | null {
  return selectRules(rules, sourceEvent, ctx)[0] ?? null;
}

/** Turn a rule's line templates into draft journal lines using the context amounts.
 *  Lines whose amount resolves to 0 are dropped (no empty postings). */
export function resolvePostingRule(rule: PostingRule, ctx: PostingContext): ResolvedLine[] {
  const lines = [...rule.lines].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const out: ResolvedLine[] = [];
  for (const line of lines) {
    const amount = round2(ctx.amounts[line.amountSource] ?? 0);
    if (amount === 0) continue;
    const costCenterId = line.costCenterSource ? (ctx.costCenters?.[line.costCenterSource] ?? null) : null;
    out.push({
      accountKey: line.accountKey,
      debit: line.side === 'debit' ? amount : 0,
      credit: line.side === 'credit' ? amount : 0,
      costCenterId,
    });
  }
  return out;
}

export interface BalanceResult { balanced: boolean; totalDebit: number; totalCredit: number; }

/** Verify Σdebit == Σcredit (within tolerance) — the journal engine's core invariant. */
export function checkBalanced(lines: ResolvedLine[]): BalanceResult {
  const totalDebit = round2(lines.reduce((s, l) => s + l.debit, 0));
  const totalCredit = round2(lines.reduce((s, l) => s + l.credit, 0));
  return { balanced: Math.abs(totalDebit - totalCredit) <= EPSILON, totalDebit, totalCredit };
}

export class UnbalancedPostingError extends Error {
  constructor(public readonly totalDebit: number, public readonly totalCredit: number) {
    super(`Unbalanced posting: debit ${totalDebit} != credit ${totalCredit}`);
    this.name = 'UnbalancedPostingError';
  }
}

/** Resolve + assert balanced. Throws UnbalancedPostingError if the rule produces
 *  an unbalanced entry (a rule-authoring error) — never write an unbalanced entry. */
export function resolveBalanced(rule: PostingRule, ctx: PostingContext): ResolvedLine[] {
  const lines = resolvePostingRule(rule, ctx);
  const { balanced, totalDebit, totalCredit } = checkBalanced(lines);
  if (!balanced) throw new UnbalancedPostingError(totalDebit, totalCredit);
  return lines;
}
