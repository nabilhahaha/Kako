import { describe, it, expect } from 'vitest';
import {
  conditionMatches, selectRules, resolveRule, resolvePostingRule,
  checkBalanced, resolveBalanced, UnbalancedPostingError,
} from './resolver';
import type { PostingRule, PostingContext } from './types';

const rule = (over: Partial<PostingRule> = {}): PostingRule => ({
  id: 'r1', companyId: null, sourceEvent: 'invoice.issued', name: 'Sales invoice',
  condition: {}, priority: 100, isActive: true,
  lines: [
    { side: 'debit', accountKey: 'ar', amountSource: 'total', sortOrder: 0 },
    { side: 'credit', accountKey: 'revenue', amountSource: 'net', sortOrder: 1 },
    { side: 'credit', accountKey: 'output_tax', amountSource: 'tax', sortOrder: 2 },
  ],
  ...over,
});
const ctx = (over: Partial<PostingContext> = {}): PostingContext => ({
  amounts: { total: 115, net: 100, tax: 15 }, ...over,
});

describe('posting-rule resolver', () => {
  it('resolves a balanced AR/Revenue/Tax entry', () => {
    const lines = resolvePostingRule(rule(), ctx());
    expect(lines).toHaveLength(3);
    const b = checkBalanced(lines);
    expect(b.totalDebit).toBe(115);
    expect(b.totalCredit).toBe(115);
    expect(b.balanced).toBe(true);
  });

  it('drops zero-amount lines (e.g. no tax)', () => {
    const lines = resolvePostingRule(rule(), ctx({ amounts: { total: 100, net: 100, tax: 0 } }));
    expect(lines.map((l) => l.accountKey)).toEqual(['ar', 'revenue']);
    expect(checkBalanced(lines).balanced).toBe(true);
  });

  it('maps cost-center source onto the line', () => {
    const r = rule({ lines: [
      { side: 'debit', accountKey: 'cogs', amountSource: 'cogs', costCenterSource: 'branch' },
      { side: 'credit', accountKey: 'inventory', amountSource: 'cogs' },
    ]});
    const lines = resolvePostingRule(r, ctx({ amounts: { cogs: 60 }, costCenters: { branch: 'cc-1' } }));
    expect(lines[0]).toMatchObject({ accountKey: 'cogs', debit: 60, costCenterId: 'cc-1' });
    expect(lines[1]).toMatchObject({ accountKey: 'inventory', credit: 60, costCenterId: null });
  });

  it('throws on an unbalanced rule', () => {
    const r = rule({ lines: [
      { side: 'debit', accountKey: 'ar', amountSource: 'total' },
      { side: 'credit', accountKey: 'revenue', amountSource: 'net' }, // missing tax credit
    ]});
    expect(() => resolveBalanced(r, ctx())).toThrow(UnbalancedPostingError);
  });

  describe('rule selection', () => {
    it('matches equality conditions; empty = match-all', () => {
      expect(conditionMatches(rule(), ctx())).toBe(true);
      expect(conditionMatches(rule({ condition: { kind: 'export' } }), ctx({ attributes: { kind: 'export' } }))).toBe(true);
      expect(conditionMatches(rule({ condition: { kind: 'export' } }), ctx({ attributes: { kind: 'local' } }))).toBe(false);
    });

    it('prefers company-specific over global default at equal priority', () => {
      const global = rule({ id: 'g', companyId: null });
      const company = rule({ id: 'c', companyId: 'co-1' });
      expect(resolveRule([global, company], 'invoice.issued', ctx())?.id).toBe('c');
    });

    it('orders by priority then filters inactive / wrong event', () => {
      const a = rule({ id: 'a', priority: 50 });
      const b = rule({ id: 'b', priority: 10 });
      const inactive = rule({ id: 'x', priority: 1, isActive: false });
      const other = rule({ id: 'o', priority: 1, sourceEvent: 'payment.received' });
      const picked = selectRules([a, b, inactive, other], 'invoice.issued', ctx());
      expect(picked.map((r) => r.id)).toEqual(['b', 'a']);
    });

    it('returns null when nothing matches', () => {
      expect(resolveRule([], 'invoice.issued', ctx())).toBeNull();
    });
  });
});
