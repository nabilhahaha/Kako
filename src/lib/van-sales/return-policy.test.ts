import { describe, it, expect } from 'vitest';
import { resolveReturnDecision, ruleMatches, canApproveReturn, DEFAULT_RETURN_POLICY, type ReturnApprovalPolicy, type ReturnContext, type ReturnRule } from './return-policy';

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

describe('delegation — primary + backup approver', () => {
  it('resolution carries both primary and backup approver from policy defaults', () => {
    const p: ReturnApprovalPolicy = { mode: 'approval', approverRole: 'supervisor', backupApproverRole: 'branch_manager', rules: [] };
    const r = resolveReturnDecision(ctx({}), p);
    expect(r.approver).toBe('supervisor');
    expect(r.backupApprover).toBe('branch_manager');
  });

  it('a matched rule can override the backup approver', () => {
    const p: ReturnApprovalPolicy = { mode: 'open', approverRole: 'supervisor', backupApproverRole: 'branch_manager', rules: [
      { priority: 1, returnType: 'damage', result: 'approval', approverLevel: 'branch_manager', backupApproverLevel: 'company_admin' },
    ] };
    const r = resolveReturnDecision(ctx({ returnType: 'damage' }), p);
    expect(r.approver).toBe('branch_manager');
    expect(r.backupApprover).toBe('company_admin');
  });

  it('primary approver (or higher rank) may approve; supervisor cannot cover a branch_manager requirement', () => {
    const res = { approver: 'branch_manager' as const, backupApprover: null };
    expect(canApproveReturn('branch_manager', res)).toBe(true); // primary
    expect(canApproveReturn('company_admin', res)).toBe(true);  // higher rank covers
    expect(canApproveReturn('supervisor', res)).toBe(false);    // lower rank cannot
  });

  it('backup approver may step in when primary is absent — without changing policy', () => {
    // Supervisor is primary, Branch Manager is the named backup. Branch Manager
    // already out-ranks supervisor, so delegation holds; an explicit equal/lower
    // backup is also honoured by name.
    const res = { approver: 'supervisor' as const, backupApprover: 'branch_manager' as const };
    expect(canApproveReturn('branch_manager', res)).toBe(true);
    // Named backup at the SAME level as primary is still allowed by name.
    const res2 = { approver: 'company_admin' as const, backupApprover: 'supervisor' as const };
    expect(canApproveReturn('supervisor', res2)).toBe(true); // named backup
    expect(canApproveReturn(null, res2)).toBe(false);        // no level → denied
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
