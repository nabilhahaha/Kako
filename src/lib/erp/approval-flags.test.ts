import { describe, it, expect, afterEach } from 'vitest';
import { creditWorkflowKey, APPROVAL_CREDIT_V2, APPROVAL_TRADE_SPEND_WF, APPROVAL_PRICE_CHANGE_WF } from './approval-flags';

const ORIG = { ...process.env };
afterEach(() => {
  process.env = { ...ORIG };
});

describe('approval flags', () => {
  it('default OFF (backward-compatible)', () => {
    delete process.env.KAKO_APPROVAL_CREDIT;
    delete process.env.KAKO_APPROVAL_TRADE_SPEND;
    delete process.env.KAKO_APPROVAL_PRICE_CHANGE;
    expect(APPROVAL_CREDIT_V2()).toBe(false);
    expect(APPROVAL_TRADE_SPEND_WF()).toBe(false);
    expect(APPROVAL_PRICE_CHANGE_WF()).toBe(false);
  });

  it('accepts "1" and "true"', () => {
    process.env.KAKO_APPROVAL_CREDIT = '1';
    expect(APPROVAL_CREDIT_V2()).toBe(true);
    process.env.KAKO_APPROVAL_CREDIT = 'true';
    expect(APPROVAL_CREDIT_V2()).toBe(true);
    process.env.KAKO_APPROVAL_CREDIT = 'yes';
    expect(APPROVAL_CREDIT_V2()).toBe(false);
  });
});

describe('creditWorkflowKey', () => {
  it('legacy key when flag off (backward-compatible)', () => {
    expect(creditWorkflowKey(false)).toBe('credit_limit_approval');
  });
  it('v2 key when flag on', () => {
    expect(creditWorkflowKey(true)).toBe('credit_limit_approval_v2');
  });
});
