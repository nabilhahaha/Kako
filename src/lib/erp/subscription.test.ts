import { describe, it, expect } from 'vitest';
import { daysLeft, companyLocked, subscriptionState } from './subscription';

// Helper: returns a date string YYYY-MM-DD offset by `days` from today.
function dateOffset(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ─── daysLeft ────────────────────────────────────────────────────────────────

describe('daysLeft', () => {
  it('returns null when there is no subscription_end date', () => {
    expect(daysLeft({ subscription_end: null })).toBeNull();
  });

  it('returns 0 when subscription_end is today', () => {
    expect(daysLeft({ subscription_end: dateOffset(0) })).toBe(0);
  });

  it('returns a positive number for a future date', () => {
    expect(daysLeft({ subscription_end: dateOffset(30) })).toBe(30);
  });

  it('returns a negative number for a past date', () => {
    expect(daysLeft({ subscription_end: dateOffset(-5) })).toBe(-5);
  });

  it('returns exactly 14 for a date 14 days away', () => {
    expect(daysLeft({ subscription_end: dateOffset(14) })).toBe(14);
  });

  it('returns exactly 1 for tomorrow', () => {
    expect(daysLeft({ subscription_end: dateOffset(1) })).toBe(1);
  });
});

// ─── companyLocked ───────────────────────────────────────────────────────────

describe('companyLocked', () => {
  it('returns false for a null company', () => {
    expect(companyLocked(null)).toBe(false);
  });

  it('returns true when the company is inactive (suspended)', () => {
    expect(companyLocked({ is_active: false, subscription_end: dateOffset(30) })).toBe(true);
  });

  it('returns true when subscription has expired', () => {
    expect(companyLocked({ is_active: true, subscription_end: dateOffset(-1) })).toBe(true);
  });

  it('returns false when active and subscription_end is in the future', () => {
    expect(companyLocked({ is_active: true, subscription_end: dateOffset(10) })).toBe(false);
  });

  it('returns false when active with no subscription_end (open-ended)', () => {
    expect(companyLocked({ is_active: true, subscription_end: null })).toBe(false);
  });
});

// ─── subscriptionState ───────────────────────────────────────────────────────

describe('subscriptionState', () => {
  it('returns "open" for a null company', () => {
    expect(subscriptionState(null)).toBe('open');
  });

  it('returns "suspended" when the company is not active', () => {
    expect(
      subscriptionState({ is_active: false, subscription_end: dateOffset(30) }),
    ).toBe('suspended');
  });

  it('returns "open" when active and subscription_end is null (no end date)', () => {
    expect(
      subscriptionState({ is_active: true, subscription_end: null }),
    ).toBe('open');
  });

  it('returns "expired" when subscription_end was yesterday', () => {
    expect(
      subscriptionState({ is_active: true, subscription_end: dateOffset(-1) }),
    ).toBe('expired');
  });

  it('returns "expired" when subscription_end is well in the past', () => {
    expect(
      subscriptionState({ is_active: true, subscription_end: dateOffset(-30) }),
    ).toBe('expired');
  });

  it('returns "expiring" when subscription_end is today (0 days left)', () => {
    expect(
      subscriptionState({ is_active: true, subscription_end: dateOffset(0) }),
    ).toBe('expiring');
  });

  it('returns "expiring" when exactly 14 days remain', () => {
    expect(
      subscriptionState({ is_active: true, subscription_end: dateOffset(14) }),
    ).toBe('expiring');
  });

  it('returns "expiring" for any day within the 0–14 day window', () => {
    for (const days of [1, 7, 13]) {
      expect(
        subscriptionState({ is_active: true, subscription_end: dateOffset(days) }),
      ).toBe('expiring');
    }
  });

  it('returns "active" when subscription_end is 15 days away', () => {
    expect(
      subscriptionState({ is_active: true, subscription_end: dateOffset(15) }),
    ).toBe('active');
  });

  it('returns "active" when subscription_end is far in the future', () => {
    expect(
      subscriptionState({ is_active: true, subscription_end: dateOffset(365) }),
    ).toBe('active');
  });
});
