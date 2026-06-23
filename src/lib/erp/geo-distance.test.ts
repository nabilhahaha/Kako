import { describe, it, expect } from 'vitest';
import { haversineMeters, isWithinRadius, validCoord, NEARBY_RADIUS_M } from './geo-distance';

describe('geo-distance (Field Verification 50 m lock)', () => {
  it('same point → 0 m', () => {
    expect(haversineMeters(24.7136, 46.6753, 24.7136, 46.6753)).toBeCloseTo(0, 5);
  });
  it('~0.0009° latitude ≈ 100 m (within tolerance)', () => {
    const m = haversineMeters(24.7136, 46.6753, 24.7136 + 0.0009, 46.6753);
    expect(m).toBeGreaterThan(95);
    expect(m).toBeLessThan(105);
  });
  it('a point ~40 m away is within the 50 m lock; ~80 m is not', () => {
    const near = haversineMeters(24.7136, 46.6753, 24.7136 + 0.00036, 46.6753); // ~40 m
    const far = haversineMeters(24.7136, 46.6753, 24.7136 + 0.00072, 46.6753);  // ~80 m
    expect(isWithinRadius(near)).toBe(true);
    expect(isWithinRadius(far)).toBe(false);
    expect(NEARBY_RADIUS_M).toBe(50);
  });
  it('honours a configurable radius (FV-3b): ~80 m passes at 100 m, fails at 50 m', () => {
    const far = haversineMeters(24.7136, 46.6753, 24.7136 + 0.00072, 46.6753); // ~80 m
    expect(isWithinRadius(far, 100)).toBe(true);   // company configured a wider radius
    expect(isWithinRadius(far, 50)).toBe(false);   // default
  });
  it('validCoord rejects null-island / out-of-range / non-finite', () => {
    expect(validCoord(24.7, 46.7)).toBe(true);
    expect(validCoord(0, 0)).toBe(false);
    expect(validCoord(91, 46)).toBe(false);
    expect(validCoord(Number.NaN, 46)).toBe(false);
    expect(validCoord(null, 46)).toBe(false);
  });
});
