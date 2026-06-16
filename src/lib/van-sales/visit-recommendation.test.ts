import { describe, it, expect } from 'vitest';
import { recommendAction, recommendedKind, daysSince, type RecoSignals } from './visit-recommendation';

const base: RecoSignals = { overdueAmount: 0, availableCredit: 1000, creditLimit: 5000, daysSinceLastPurchase: 5 };

describe('recommendAction', () => {
  it('healthy customer → new_sale', () => {
    expect(recommendAction(base)).toBe('new_sale');
  });
  it('overdue balance → collection', () => {
    expect(recommendAction({ ...base, overdueAmount: 250 })).toBe('collection');
  });
  it('at/over credit limit → collect_before_sell', () => {
    expect(recommendAction({ ...base, availableCredit: 0 })).toBe('collect_before_sell');
    expect(recommendAction({ ...base, availableCredit: -50 })).toBe('collect_before_sell');
  });
  it('cash-only (no limit) does not trigger collect_before_sell', () => {
    expect(recommendAction({ ...base, creditLimit: 0, availableCredit: 0 })).toBe('new_sale');
  });
  it('lapsed (≥45 days) → reactivation', () => {
    expect(recommendAction({ ...base, daysSinceLastPurchase: 45 })).toBe('reactivation');
    expect(recommendAction({ ...base, daysSinceLastPurchase: 60 })).toBe('reactivation');
    expect(recommendAction({ ...base, daysSinceLastPurchase: 44 })).toBe('new_sale');
  });
  it('open return requests take priority over everything', () => {
    expect(recommendAction({ ...base, hasOpenReturnRequests: true, overdueAmount: 999, availableCredit: -1 })).toBe('process_return');
  });
  it('priority: overdue beats credit limit beats lapsed', () => {
    expect(recommendAction({ ...base, overdueAmount: 1, availableCredit: -1, daysSinceLastPurchase: 90 })).toBe('collection');
    expect(recommendAction({ ...base, availableCredit: -1, daysSinceLastPurchase: 90 })).toBe('collect_before_sell');
  });
  it('configurable lapse threshold', () => {
    expect(recommendAction({ ...base, daysSinceLastPurchase: 30, lapsedDays: 30 })).toBe('reactivation');
  });
});

describe('recommendedKind', () => {
  it('maps each action to its transaction', () => {
    expect(recommendedKind('process_return')).toBe('return');
    expect(recommendedKind('collection')).toBe('collect');
    expect(recommendedKind('collect_before_sell')).toBe('collect');
    expect(recommendedKind('reactivation')).toBe('sell');
    expect(recommendedKind('new_sale')).toBe('sell');
  });
});

describe('daysSince', () => {
  it('computes whole-day gaps; null-safe', () => {
    expect(daysSince('2026-06-01', '2026-06-16')).toBe(15);
    expect(daysSince(null, '2026-06-16')).toBeNull();
    expect(daysSince('2026-06-16', '2026-06-16')).toBe(0);
  });
});
