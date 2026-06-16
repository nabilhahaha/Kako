import { describe, it, expect } from 'vitest';
import { resolveReturnDecision, ruleMatches, DEFAULT_RETURN_POLICY, type ReturnApprovalPolicy, type ReturnContext, type ReturnRule } from './return-policy';

const ctx = (over: Partial<ReturnContext>): ReturnContext => ({ returnType: 'saleable', value: 100, ...over });

// Company policy expressed entirely as DATA (configurable, not hardcoded):
//  • Damage → always approval
//  • VIP customer class → always approval
//  • Saleable ≤ 500 → auto;  (else the mode default = approval)
const policy: ReturnApprovalPolicy = {
  mode: 'approval',
  approverRole: 'supervisor',
  rules: [
    { priority: 1, returnType: 'damage', result: 'approval' },
    { priority: 2, customerClass: 'vip', result: 'approval' },
    { priority: 10, returnType: 'saleable', maxValue: 500, result: 'auto' },
  ],
};

describe('resolveReturnDecision (rules-driven)', () => {
  it('mode disabled → block everything', () => {
    expect(resolveReturnDecision(ctx({}), { ...policy, mode: 'disabled' }).decision).toBe('block');
  });

  it('mode open with no rules → auto (default policy)', () => {
    expect(resolveReturnDecision(ctx({ value: 99999 }), DEFAULT_RETURN_POLICY).decision).toBe('auto');
  });

  it('saleable ≤ 500 → auto; > 500 → approval (mode default)', () => {
    expect(resolveReturnDecision(ctx({ returnType: 'saleable', value: 500 }), policy).decision).toBe('auto');
    expect(resolveReturnDecision(ctx({ returnType: 'saleable', value: 500.01 }), policy).decision).toBe('approval');
  });

  it('damage → always approval (any value), via the damage rule', () => {
    const r = resolveReturnDecision(ctx({ returnType: 'damage', value: 10 }), policy);
    expect(r.decision).toBe('approval');
    expect(r.matchedRule).toBe(0);
  });

  it('VIP customer class → always approval, even for a small saleable return', () => {
    expect(resolveReturnDecision(ctx({ returnType: 'saleable', value: 50, customerClass: 'vip' }), policy).decision).toBe('approval');
  });

  it('first matching rule by priority wins + carries its approver level', () => {
    const p: ReturnApprovalPolicy = { mode: 'open', approverRole: 'supervisor', rules: [
      { priority: 5, salesmanId: 's1', result: 'approval', approverLevel: 'branch_manager' },
      { priority: 1, routeId: 'r9', result: 'block' },
    ] };
    expect(resolveReturnDecision(ctx({ routeId: 'r9' }), p).decision).toBe('block'); // priority 1 first
    const m = resolveReturnDecision(ctx({ salesmanId: 's1' }), p);
    expect(m.decision).toBe('approval');
    expect(m.approver).toBe('branch_manager');
  });

  it('matches on product category membership', () => {
    const p: ReturnApprovalPolicy = { mode: 'open', rules: [{ priority: 1, productCategoryId: 'catA', result: 'approval' }] };
    expect(resolveReturnDecision(ctx({ productCategoryIds: ['catA', 'catB'] }), p).decision).toBe('approval');
    expect(resolveReturnDecision(ctx({ productCategoryIds: ['catB'] }), p).decision).toBe('auto'); // no match → open default
  });
});

describe('ruleMatches (AND of non-null criteria)', () => {
  const r: ReturnRule = { priority: 1, returnType: 'saleable', customerId: 'c1', minValue: 100, result: 'approval' };
  it('requires every set criterion', () => {
    expect(ruleMatches(r, ctx({ returnType: 'saleable', customerId: 'c1', value: 150 }))).toBe(true);
    expect(ruleMatches(r, ctx({ returnType: 'saleable', customerId: 'c2', value: 150 }))).toBe(false); // wrong customer
    expect(ruleMatches(r, ctx({ returnType: 'saleable', customerId: 'c1', value: 50 }))).toBe(false);  // below min
    expect(ruleMatches(r, ctx({ returnType: 'damage', customerId: 'c1', value: 150 }))).toBe(false);   // wrong type
  });
});
