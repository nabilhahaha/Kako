import { describe, it, expect } from 'vitest';
import { auditTerritory } from './audit';
import { buildTisCustomer, buildTisDataset } from './dataset';
import type { VisitFrequency } from '@/lib/route-optimization/visit-frequency';

const weekly: VisitFrequency = { unit: 'week', everyN: 1, visitsPerCycle: 1 };
const triWeekly: VisitFrequency = { unit: 'week', everyN: 1, visitsPerCycle: 3 };
const geo = (i: number) => ({ lat: 24.7 + i * 0.01, lng: 46.7 + i * 0.01 });

describe('auditTerritory — Mode A (no coverage)', () => {
  const ds = buildTisDataset([
    buildTisCustomer({ id: 'a', name: 'A', geo: geo(1), frequency: triWeekly, grade: 'a', ownership: { routeId: 'R1', regionId: 'G1' } as never }),
    buildTisCustomer({ id: 'b', name: 'B', geo: geo(2), frequency: weekly, grade: 'b', ownership: { routeId: 'R1', regionId: 'G1' } as never }),
    buildTisCustomer({ id: 'c', name: 'C', geo: geo(3), frequency: weekly, grade: 'c', ownership: { routeId: 'R2', regionId: 'G2' } as never }),
    buildTisCustomer({ id: 'd', name: 'D', geo: geo(4) }), // unassigned, no cadence
  ], { source: 'upload' });
  const a = auditTerritory(ds);

  it('coverage gaps unavailable without coverage data', () => {
    expect(a.mode).toBe('A');
    expect(a.coverageGaps.available).toBe(false);
  });
  it('computes territory + route balance sections', () => {
    expect(a.territoryBalance).not.toBeNull();
    expect(a.routeBalance).not.toBeNull();
    expect(a.routeBalance!.workloadBalancePct).toBeGreaterThanOrEqual(0);
  });
  it('distribution by grade', () => {
    const grades = Object.fromEntries(a.distribution.byGrade.map((b) => [b.key, b.count]));
    expect(grades.a).toBe(1); expect(grades.b).toBe(1); expect(grades.c).toBe(1); expect(grades['—']).toBe(1);
    expect(a.distribution.assigned).toBe(3);
    expect(a.distribution.unassigned).toBe(1);
  });
  it('internal white-space: unassigned + no-cadence', () => {
    expect(a.whiteSpace.counts.unassigned).toBe(1);
    expect(a.whiteSpace.counts.noCadence).toBe(1);
    expect(a.whiteSpace.unassigned).toContain('d');
    expect(a.whiteSpace.counts.total).toBe(1); // d covers both reasons
  });
});

describe('auditTerritory — Mode B (coverage present)', () => {
  const ds = buildTisDataset([
    buildTisCustomer({ id: 'a', name: 'A', geo: geo(1), frequency: weekly, coverage: 'on_track', ownership: { routeId: 'R1' } as never }),
    buildTisCustomer({ id: 'b', name: 'B', geo: geo(2), frequency: weekly, coverage: 'under_covered', ownership: { routeId: 'R1' } as never }),
    buildTisCustomer({ id: 'c', name: 'C', geo: geo(3), frequency: weekly, coverage: 'never_visited', ownership: { routeId: 'R2' } as never }),
  ]);
  const a = auditTerritory(ds);

  it('coverage gaps available + counted in headline', () => {
    expect(a.mode).toBe('B');
    expect(a.coverageGaps.available).toBe(true);
    expect(a.headline.gapCount).toBe(2);        // under + never
    expect(a.headline.coveragePct).toBeCloseTo(33.3, 1);
    expect(a.whiteSpace.neverVisited).toContain('c');
  });
});

describe('auditTerritory — balance sensitivity', () => {
  it('even workload across routes ⇒ high balance; skewed ⇒ lower', () => {
    const even = buildTisDataset([
      buildTisCustomer({ id: '1', name: '1', geo: geo(1), frequency: weekly, ownership: { routeId: 'R1', regionId: 'G' } as never }),
      buildTisCustomer({ id: '2', name: '2', geo: geo(2), frequency: weekly, ownership: { routeId: 'R2', regionId: 'G' } as never }),
    ]);
    const skewed = buildTisDataset([
      buildTisCustomer({ id: '1', name: '1', geo: geo(1), frequency: triWeekly, ownership: { routeId: 'R1', regionId: 'G' } as never }),
      buildTisCustomer({ id: '2', name: '2', geo: geo(2), frequency: triWeekly, ownership: { routeId: 'R1', regionId: 'G' } as never }),
      buildTisCustomer({ id: '3', name: '3', geo: geo(3), frequency: weekly, ownership: { routeId: 'R2', regionId: 'G' } as never }),
    ]);
    expect(auditTerritory(even).routeBalance!.workloadBalancePct).toBe(100);
    expect(auditTerritory(skewed).routeBalance!.workloadBalancePct).toBeLessThan(100);
  });
});
