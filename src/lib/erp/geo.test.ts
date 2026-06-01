import { describe, it, expect } from 'vitest';
import { haversineMeters, geofenceStatus, needsExceptionPhoto } from './geo';

describe('geo · haversineMeters', () => {
  it('is zero at the same point and null when a coord is missing', () => {
    expect(haversineMeters(30, 31, 30, 31)).toBe(0);
    expect(haversineMeters(null, 31, 30, 31)).toBeNull();
  });
  it('matches a known short distance (~0.002° lat ≈ 222 m)', () => {
    const d = haversineMeters(30.0, 31.0, 30.002, 31.0)!;
    expect(d).toBeGreaterThan(210);
    expect(d).toBeLessThan(235);
  });
});

describe('geo · geofenceStatus', () => {
  it('classifies inside/outside/unknown', () => {
    expect(geofenceStatus(120, 150)).toBe('ok');
    expect(geofenceStatus(320, 150)).toBe('violation');
    expect(geofenceStatus(null, 150)).toBe('unknown');
  });
});

describe('geo · needsExceptionPhoto', () => {
  it('mirrors the server rule (blocking always; advisory beyond threshold)', () => {
    expect(needsExceptionPhoto('ok', 50, 'advisory', 500)).toBe(false);
    expect(needsExceptionPhoto('violation', 300, 'advisory', 500)).toBe(false);
    expect(needsExceptionPhoto('violation', 600, 'advisory', 500)).toBe(true);
    expect(needsExceptionPhoto('violation', 100, 'blocking', 500)).toBe(true);
  });
});
