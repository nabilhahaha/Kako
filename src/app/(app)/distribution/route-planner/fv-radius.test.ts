import { describe, it, expect } from 'vitest';
import { radiusEnforced, radiusLockBlocks, radiusWaived } from './fv-radius';

describe('fv-radius', () => {
  it('radiusEnforced mirrors the requireGps setting', () => {
    expect(radiusEnforced(true)).toBe(true);
    expect(radiusEnforced(false)).toBe(false);
  });

  describe('radiusLockBlocks — ON (requireGps=true)', () => {
    it('blocks when outside the radius', () => {
      expect(radiusLockBlocks(true, 120, 50)).toBe(true);
    });
    it('blocks when no distance fix is available', () => {
      expect(radiusLockBlocks(true, null, 50)).toBe(true);
    });
    it('allows when within the radius', () => {
      expect(radiusLockBlocks(true, 30, 50)).toBe(false);
      expect(radiusLockBlocks(true, 50, 50)).toBe(false); // boundary inclusive
    });
  });

  describe('radiusLockBlocks — OFF (requireGps=false)', () => {
    it('never blocks, even far outside the radius or with no fix', () => {
      expect(radiusLockBlocks(false, 9999, 50)).toBe(false);
      expect(radiusLockBlocks(false, null, 50)).toBe(false);
      expect(radiusLockBlocks(false, 10, 50)).toBe(false);
    });
  });

  it('radiusWaived: badge only when explicitly not enforced (false); null/true → no badge', () => {
    expect(radiusWaived({ radiusEnforced: false })).toBe(true);
    expect(radiusWaived({ radiusEnforced: true })).toBe(false);
    expect(radiusWaived({ radiusEnforced: null })).toBe(false);   // legacy rows = enforced
    expect(radiusWaived({})).toBe(false);
  });
});
