import { describe, it, expect } from 'vitest';
import {
  haversineMeters, isEligible, rankNextCustomers, nextPlanned, formatDistance,
  type NextCandidate,
} from './next-customer';
import { googleMapsUrl, appleMapsUrl, wazeUrl, mapUrl, hasValidCoords } from './map-links';

const base = (over: Partial<NextCandidate>): NextCandidate => ({
  customerId: over.customerId ?? 'c', name: 'n', sequence: over.sequence ?? 1,
  latitude: null, longitude: null, overdue: false, creditWarning: false,
  visited: false, active: true, ...over,
});

// Aziz Mall Jeddah area (pilot)
const ORIGIN = { lat: 21.5256, lng: 39.1817 };

describe('haversineMeters', () => {
  it('is ~0 for the same point', () => {
    expect(haversineMeters(ORIGIN, ORIGIN)).toBeLessThan(1);
  });
  it('matches a known ~1.5km separation within tolerance', () => {
    const d = haversineMeters({ lat: 21.5256, lng: 39.1817 }, { lat: 21.5390, lng: 39.1817 });
    expect(d).toBeGreaterThan(1400);
    expect(d).toBeLessThan(1600);
  });
});

describe('isEligible (route protection)', () => {
  it('excludes visited and inactive; includes active+unvisited', () => {
    expect(isEligible(base({ visited: true }))).toBe(false);
    expect(isEligible(base({ active: false }))).toBe(false);
    expect(isEligible(base({}))).toBe(true);
  });
});

describe('rankNextCustomers', () => {
  const cands: NextCandidate[] = [
    base({ customerId: 'far', sequence: 1, latitude: 21.55, longitude: 39.20 }),
    base({ customerId: 'near', sequence: 2, latitude: 21.5260, longitude: 39.1820 }),
    base({ customerId: 'mid', sequence: 3, latitude: 21.5300, longitude: 39.1850 }),
    base({ customerId: 'visited', sequence: 4, latitude: 21.5257, longitude: 39.1818, visited: true }),
    base({ customerId: 'inactive', sequence: 5, latitude: 21.5258, longitude: 39.1819, active: false }),
  ];

  it('returns only eligible, nearest-first, capped at the limit', () => {
    const out = rankNextCustomers(cands, ORIGIN, { limit: 5 });
    expect(out.map((c) => c.customerId)).toEqual(['near', 'mid', 'far']);
    expect(out.find((c) => c.customerId === 'visited')).toBeUndefined();
    expect(out.find((c) => c.customerId === 'inactive')).toBeUndefined();
  });

  it('honours the top-N limit', () => {
    expect(rankNextCustomers(cands, ORIGIN, { limit: 2 }).map((c) => c.customerId)).toEqual(['near', 'mid']);
  });

  it('falls back to route sequence when no GPS', () => {
    const out = rankNextCustomers(cands, null);
    expect(out.map((c) => c.customerId)).toEqual(['far', 'near', 'mid']); // sequence 1,2,3
    expect(out[0].distanceM).toBeNull();
  });

  it('nextPlanned returns the single best eligible (route-first)', () => {
    expect(nextPlanned(cands, ORIGIN)?.customerId).toBe('near');
    expect(nextPlanned([], ORIGIN)).toBeNull();
  });
});

describe('route preservation (route-first ranking)', () => {
  // Two stops ~520m apart on the route. seq1 is first in the plan.
  const seq1 = base({ customerId: 's1', sequence: 1, latitude: 21.5256, longitude: 39.1817 });
  const seq2Near = (lat: number) => base({ customerId: 's2', sequence: 2, latitude: lat, longitude: 39.1817 });

  it('does NOT jump to a later stop that is only SLIGHTLY closer', () => {
    // Move origin so seq2 is just ~50m closer than seq1 — within one route step.
    const origin = { lat: 21.5256 + 0.0002, lng: 39.1817 }; // ~22m north of seq1
    const out = rankNextCustomers([seq1, seq2Near(21.5262)], origin); // seq2 ~10m further north
    expect(out[0].customerId).toBe('s1'); // route preserved
  });

  it('DOES promote a later stop that is SIGNIFICANTLY closer', () => {
    // seq1 is ~3km away; seq2 is right next to the rep → big saving beats the step penalty.
    const origin = { lat: 21.5500, lng: 39.1817 };
    const farSeq1 = base({ customerId: 's1', sequence: 1, latitude: 21.5256, longitude: 39.1817 });
    const nearSeq2 = base({ customerId: 's2', sequence: 2, latitude: 21.5501, longitude: 39.1817 });
    const out = rankNextCustomers([farSeq1, nearSeq2], origin);
    expect(out[0].customerId).toBe('s2'); // intelligent distance refinement
  });

  it('ALWAYS recommends the next planned stop when it is within the near threshold', () => {
    const origin = { lat: 21.5256, lng: 39.1817 };
    const plannedNear = base({ customerId: 's1', sequence: 1, latitude: 21.5256, longitude: 39.19039 }); // ~900m (≤1km)
    const laterCloser = base({ customerId: 's2', sequence: 2, latitude: 21.5256, longitude: 39.182183 }); // ~50m
    // Default 1km guard → the planned stop wins even though s2 is much closer.
    expect(rankNextCustomers([plannedNear, laterCloser], origin)[0].customerId).toBe('s1');
    // Disable the guard (threshold 0) → distance refinement promotes the closer s2.
    expect(rankNextCustomers([plannedNear, laterCloser], origin, { weights: { routeStepMeters: 400, nearThresholdMeters: 0 } })[0].customerId).toBe('s2');
  });

  it('stricter routeStepMeters enforces tighter route adherence', () => {
    const origin = { lat: 21.5400, lng: 39.1817 };
    const farSeq1 = base({ customerId: 's1', sequence: 1, latitude: 21.5256, longitude: 39.1817 }); // ~1.6km
    const nearSeq2 = base({ customerId: 's2', sequence: 2, latitude: 21.5395, longitude: 39.1817 }); // ~55m
    // Default (400m) promotes the much-closer seq2…
    expect(rankNextCustomers([farSeq1, nearSeq2], origin)[0].customerId).toBe('s2');
    // …but a very strict 5km step keeps the planned order.
    expect(rankNextCustomers([farSeq1, nearSeq2], origin, { weights: { routeStepMeters: 5000 } })[0].customerId).toBe('s1');
  });
});

describe('formatDistance', () => {
  it('formats metres and kilometres per locale', () => {
    expect(formatDistance(250, 'en')).toBe('250 m');
    expect(formatDistance(1500, 'en')).toBe('1.5 km');
    expect(formatDistance(250, 'ar')).toBe('250 م');
    expect(formatDistance(null, 'en')).toBe('—');
  });
});

describe('map-links', () => {
  it('builds provider URLs with the destination', () => {
    expect(googleMapsUrl(21.5, 39.1)).toContain('destination=21.5,39.1');
    expect(appleMapsUrl(21.5, 39.1)).toContain('daddr=21.5,39.1');
    expect(wazeUrl(21.5, 39.1)).toContain('ll=21.5,39.1');
    expect(mapUrl('waze', 1, 2)).toBe(wazeUrl(1, 2));
    expect(mapUrl('apple', 1, 2)).toBe(appleMapsUrl(1, 2));
    expect(mapUrl('google', 1, 2)).toBe(googleMapsUrl(1, 2));
  });
  it('validates coordinates (rejects null / 0,0 / out-of-range)', () => {
    expect(hasValidCoords(21.5, 39.1)).toBe(true);
    expect(hasValidCoords(null, 39.1)).toBe(false);
    expect(hasValidCoords(0, 0)).toBe(false);
    expect(hasValidCoords(91, 39)).toBe(false);
  });
});
