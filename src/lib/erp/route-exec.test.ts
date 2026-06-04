import { describe, it, expect } from 'vitest';
import { routeCompletion, missedStops, nextStop, gpsComplianceRate, routeHealth, type RouteStopLike } from './route-exec';

const stops: RouteStopLike[] = [
  { customer_id: 'a', sequence: 1 },
  { customer_id: 'b', sequence: 2 },
  { customer_id: 'c', sequence: 3 },
  { customer_id: 'd', sequence: 4 },
];

describe('route-exec · completion', () => {
  it('computes planned/visited/remaining/pct', () => {
    expect(routeCompletion(stops, ['a', 'c'])).toEqual({ planned: 4, visited: 2, remaining: 2, pct: 50 });
  });
  it('empty route → 0%', () => {
    expect(routeCompletion([], []).pct).toBe(0);
  });
});

describe('route-exec · missed + next', () => {
  it('missed stops in sequence order', () => {
    expect(missedStops(stops, ['a']).map((s) => s.customer_id)).toEqual(['b', 'c', 'd']);
  });
  it('next stop is the lowest-sequence un-visited', () => {
    expect(nextStop(stops, ['a', 'b'])?.customer_id).toBe('c');
    expect(nextStop(stops, ['a', 'b', 'c', 'd'])).toBeNull();
  });
});

describe('route-exec · gps compliance', () => {
  it('rate of compliant visits', () => {
    expect(gpsComplianceRate(10, 2)).toBe(80);
    expect(gpsComplianceRate(0, 0)).toBe(100);
    expect(gpsComplianceRate(5, 5)).toBe(0);
  });
});

describe('route-exec · health', () => {
  it('completion-driven, penalized by flags', () => {
    expect(routeHealth(90).band).toBe('good');
    expect(routeHealth(90, 3).score).toBe(66); // 90 - 24
    expect(routeHealth(40).band).toBe('critical');
    expect(routeHealth(0).band).toBe('none');
  });
});
