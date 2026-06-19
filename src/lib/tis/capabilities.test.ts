import { describe, it, expect } from 'vitest';
import { resolveCapabilities } from './capabilities';
import { buildTisCustomer, buildTisDataset } from './dataset';
import type { VisitFrequency } from '@/lib/route-optimization/visit-frequency';

const weekly: VisitFrequency = { unit: 'week', everyN: 1, visitsPerCycle: 1 };
const geoA = { lat: 24.7, lng: 46.7 };

describe('resolveCapabilities — modes', () => {
  it('Mode A: geo + frequency only ⇒ optimization-only, no overlays', () => {
    const ds = buildTisDataset([
      buildTisCustomer({ id: 'a', name: 'A', geo: geoA, frequency: weekly, grade: 'a' }),
      buildTisCustomer({ id: 'b', name: 'B', geo: geoA, frequency: weekly, grade: 'b' }),
    ], { source: 'upload' });
    const r = resolveCapabilities(ds);
    expect(r.mode).toBe('A');
    expect(r.capabilities.routeOptimization).toBe(true);
    expect(r.capabilities.territoryAudit).toBe(true);
    expect(r.capabilities.salesForceSizing).toBe(true);
    expect(r.capabilities.visualPlanning).toBe(true);
    expect(r.capabilities.coverageOverlay).toBe(false);
    expect(r.capabilities.healthOverlay).toBe(false);
  });

  it('Mode B: coverage present ⇒ connected', () => {
    const ds = buildTisDataset([
      buildTisCustomer({ id: 'a', name: 'A', geo: geoA, frequency: weekly, coverage: 'on_track' }),
      buildTisCustomer({ id: 'b', name: 'B', geo: geoA, frequency: weekly, coverage: 'under_covered' }),
    ]);
    const r = resolveCapabilities(ds);
    expect(r.mode).toBe('B');
    expect(r.capabilities.coverageOverlay).toBe(true);
    expect(r.capabilities.healthOverlay).toBe(false);
  });

  it('Mode C: coverage + health present ⇒ full', () => {
    const ds = buildTisDataset([
      buildTisCustomer({ id: 'a', name: 'A', geo: geoA, frequency: weekly, coverage: 'on_track', health: 90 }),
      buildTisCustomer({ id: 'b', name: 'B', geo: geoA, frequency: weekly, coverage: 'never_visited', health: 20 }),
    ]);
    const r = resolveCapabilities(ds);
    expect(r.mode).toBe('C');
    expect(r.capabilities.healthOverlay).toBe(true);
    expect(r.capabilities.coverageOverlay).toBe(true);
  });
});

describe('resolveCapabilities — degradation by missing data', () => {
  it('no geo ⇒ optimization/audit/planning off, sizing still on (workload only)', () => {
    const ds = buildTisDataset([
      buildTisCustomer({ id: 'a', name: 'A', frequency: weekly }),
      buildTisCustomer({ id: 'b', name: 'B', frequency: weekly }),
    ]);
    const r = resolveCapabilities(ds);
    expect(r.capabilities.visualPlanning).toBe(false);
    expect(r.capabilities.routeOptimization).toBe(false);
    expect(r.capabilities.territoryAudit).toBe(false);
    expect(r.capabilities.salesForceSizing).toBe(true);
  });

  it('threshold: below minFraction a signal does not count', () => {
    // 1 of 3 has geo (0.33 < 0.5) ⇒ no geo capability.
    const ds = buildTisDataset([
      buildTisCustomer({ id: 'a', name: 'A', geo: geoA, frequency: weekly }),
      buildTisCustomer({ id: 'b', name: 'B', frequency: weekly }),
      buildTisCustomer({ id: 'c', name: 'C', frequency: weekly }),
    ]);
    const r = resolveCapabilities(ds);
    expect(r.signals.geo).toBeCloseTo(1 / 3, 5);
    expect(r.capabilities.visualPlanning).toBe(false);
    expect(r.capabilities.salesForceSizing).toBe(true); // frequency = 1.0
  });

  it('empty dataset ⇒ nothing available, mode A', () => {
    const r = resolveCapabilities(buildTisDataset([]));
    expect(r.mode).toBe('A');
    expect(Object.values(r.capabilities).every((v) => v === false)).toBe(true);
  });
});
