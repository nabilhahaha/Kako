import { describe, it, expect } from 'vitest';
import { distanceMeters, sortJourney, type JourneyStop } from './journey-sort';

const stop = (id: string, sequence: number, lat: number | null, lng: number | null): JourneyStop => ({
  customerId: id, sequence, latitude: lat, longitude: lng,
});

// A small cluster around Riyadh; A near origin, then B, then C farther.
const origin = { latitude: 24.7000, longitude: 46.6700 };
const A = stop('A', 3, 24.7010, 46.6700); // ~110m
const B = stop('B', 2, 24.7100, 46.6700); // ~1.1km
const C = stop('C', 1, 24.7300, 46.6700); // ~3.3km

describe('journey-sort · distanceMeters', () => {
  it('haversine in metres; Infinity when coords missing', () => {
    expect(distanceMeters(origin, A)).toBeGreaterThan(50);
    expect(distanceMeters(origin, A)).toBeLessThan(200);
    expect(distanceMeters(origin, { latitude: null, longitude: null })).toBe(Infinity);
    expect(distanceMeters(null, A)).toBe(Infinity);
  });
});

describe('journey-sort · sortJourney', () => {
  it('manual: by planned sequence', () => {
    expect(sortJourney([A, B, C], 'manual').map((s) => s.customerId)).toEqual(['C', 'B', 'A']);
  });

  it('nearest: closest-first from origin', () => {
    expect(sortJourney([C, B, A], 'nearest', origin).map((s) => s.customerId)).toEqual(['A', 'B', 'C']);
  });

  it('optimized: greedy nearest-neighbour tour from origin', () => {
    // from origin → A (closest) → B → C
    expect(sortJourney([C, A, B], 'optimized', origin).map((s) => s.customerId)).toEqual(['A', 'B', 'C']);
  });

  it('hybrid: sequenced stops keep manual order, unsequenced appended optimized', () => {
    const seqStop = stop('S', 1, 24.7300, 46.6700);
    const u1 = stop('U1', 0, 24.7010, 46.6700);
    const u2 = stop('U2', 0, 24.7100, 46.6700);
    const out = sortJourney([u2, seqStop, u1], 'hybrid', origin).map((s) => s.customerId);
    expect(out[0]).toBe('S');                 // sequenced first
    expect(out.slice(1)).toEqual(['U1', 'U2']); // unsequenced optimized (U1 closer)
  });

  it('stops without GPS sort last under proximity modes (never dropped)', () => {
    const noGps = stop('NG', 5, null, null);
    const out = sortJourney([noGps, A, B], 'nearest', origin).map((s) => s.customerId);
    expect(out).toHaveLength(3);
    expect(out[out.length - 1]).toBe('NG');
  });

  it('manual is stable + deterministic on equal sequence', () => {
    const x = stop('X', 1, null, null);
    const y = stop('Y', 1, null, null);
    expect(sortJourney([y, x], 'manual').map((s) => s.customerId)).toEqual(['X', 'Y']);
  });
});
