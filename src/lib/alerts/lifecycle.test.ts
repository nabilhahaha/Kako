import { describe, it, expect } from 'vitest';
import { canTransitionAlert, snoozeExpired, clampSnoozeHours } from './lifecycle';

describe('alerts/lifecycle', () => {
  it('allows only legal transitions', () => {
    expect(canTransitionAlert('open', 'acknowledged')).toBe(true);
    expect(canTransitionAlert('open', 'snoozed')).toBe(true);
    expect(canTransitionAlert('open', 'resolved')).toBe(true);
    expect(canTransitionAlert('acknowledged', 'resolved')).toBe(true);
    expect(canTransitionAlert('snoozed', 'open')).toBe(true);
    // illegal
    expect(canTransitionAlert('resolved', 'open')).toBe(false);
    expect(canTransitionAlert('acknowledged', 'open')).toBe(false);
    expect(canTransitionAlert('resolved', 'acknowledged')).toBe(false);
  });

  it('snoozeExpired: true once the timer passes', () => {
    expect(snoozeExpired(100, 200)).toBe(true);
    expect(snoozeExpired(300, 200)).toBe(false);
    expect(snoozeExpired(null, 200)).toBe(false);
  });

  it('clampSnoozeHours: positive, 1h..30d, fallback on junk', () => {
    expect(clampSnoozeHours(4, 24)).toBe(4);
    expect(clampSnoozeHours(0, 24)).toBe(24);          // fallback
    expect(clampSnoozeHours(NaN, 12)).toBe(12);        // fallback
    expect(clampSnoozeHours(99999, 24)).toBe(24 * 30); // capped
    expect(clampSnoozeHours(0.2, 24)).toBe(1);         // positive but below the 1h floor → 1
  });
});
