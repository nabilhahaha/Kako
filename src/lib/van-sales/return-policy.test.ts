import { describe, it, expect } from 'vitest';
import { resolveReturnPolicy, resolveApprovalLevel, DEFAULT_RETURN_POLICY, type ReturnPolicy } from './return-policy';

const policy = (over: Partial<ReturnPolicy>): ReturnPolicy => ({
  mode: 'approval',
  rules: {
    saleable: { requireApproval: false, autoApproveLimit: 500 },
    damage: { requireApproval: true, autoApproveLimit: null },
  },
  ...over,
});

describe('resolveReturnPolicy', () => {
  it('closed mode blocks every return', () => {
    expect(resolveReturnPolicy('saleable', 10, policy({ mode: 'closed' }))).toBe('blocked');
    expect(resolveReturnPolicy('damage', 10, policy({ mode: 'closed' }))).toBe('blocked');
  });

  it('open mode auto-posts (default policy)', () => {
    expect(resolveReturnPolicy('saleable', 9999, DEFAULT_RETURN_POLICY)).toBe('auto');
  });

  it('saleable: 0–500 auto, above 500 approval', () => {
    const p = policy({});
    expect(resolveReturnPolicy('saleable', 0, p)).toBe('auto');
    expect(resolveReturnPolicy('saleable', 500, p)).toBe('auto');
    expect(resolveReturnPolicy('saleable', 500.01, p)).toBe('approval');
    expect(resolveReturnPolicy('saleable', 1000, p)).toBe('approval');
  });

  it('damage always requires approval, even at value 0 and even in open mode', () => {
    expect(resolveReturnPolicy('damage', 0, policy({}))).toBe('approval');
    expect(resolveReturnPolicy('damage', 0, policy({ mode: 'open' }))).toBe('approval');
  });

  it('approval mode with no auto band → always approval', () => {
    const p = policy({ rules: { saleable: { requireApproval: false, autoApproveLimit: null }, damage: { requireApproval: true, autoApproveLimit: null } } });
    expect(resolveReturnPolicy('saleable', 1, p)).toBe('approval');
  });
});

describe('resolveApprovalLevel', () => {
  const bands = [
    { maxValue: 1000, level: 'supervisor' as const },
    { maxValue: 5000, level: 'branch_manager' as const },
  ];
  it('picks the first band whose ceiling covers the value', () => {
    expect(resolveApprovalLevel(500, bands)).toBe('supervisor');
    expect(resolveApprovalLevel(1000, bands)).toBe('supervisor');
    expect(resolveApprovalLevel(1500, bands)).toBe('branch_manager');
  });
  it('beyond all bands → the highest level', () => {
    expect(resolveApprovalLevel(9999, bands)).toBe('branch_manager');
  });
  it('defaults to supervisor with no bands', () => {
    expect(resolveApprovalLevel(100, [])).toBe('supervisor');
    expect(resolveApprovalLevel(100, undefined)).toBe('supervisor');
  });
});
