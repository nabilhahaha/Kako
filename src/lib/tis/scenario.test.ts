import { describe, it, expect } from 'vitest';
import { applyScenario, scenarioMetrics, compareScenarios, type Scenario } from './scenario';
import { buildTisCustomer, buildTisDataset } from './dataset';
import type { VisitFrequency } from '@/lib/route-optimization/visit-frequency';

const weekly: VisitFrequency = { unit: 'week', everyN: 1, visitsPerCycle: 1 };
const triWeekly: VisitFrequency = { unit: 'week', everyN: 1, visitsPerCycle: 3 };

const base = buildTisDataset([
  buildTisCustomer({ id: 'a', name: 'A', geo: { lat: 24.70, lng: 46.70 }, frequency: triWeekly, salesValue: 500, coverage: 'on_track', ownership: { routeId: 'R1' } as never }),
  buildTisCustomer({ id: 'b', name: 'B', geo: { lat: 24.71, lng: 46.71 }, frequency: weekly, salesValue: 300, coverage: 'under_covered', ownership: { routeId: 'R1' } as never }),
  buildTisCustomer({ id: 'c', name: 'C', geo: { lat: 24.90, lng: 46.95 }, frequency: weekly, salesValue: 200, coverage: 'never_visited', ownership: { routeId: 'R2' } as never }),
]);

describe('scenarioMetrics', () => {
  it('aggregates workload / sales / coverage / routes', () => {
    const m = scenarioMetrics(base);
    expect(m.customers).toBe(3);
    expect(m.visits).toBe(5);          // 3 + 1 + 1 visits/week
    expect(m.salesValue).toBe(1000);
    expect(m.routeCount).toBe(2);      // R1, R2
    expect(m.coveragePct).toBeCloseTo(33.3, 1); // 1 of 3 on_track/over
    expect(m.distanceM).toBeGreaterThan(0);      // R1 has 2 geo stops
  });
});

describe('applyScenario', () => {
  it('overrides route ownership without mutating the base', () => {
    const scen: Scenario = { id: 's1', name: 'A', assignments: [{ customerId: 'c', routeId: 'R1' }] };
    const next = applyScenario(base, scen);
    expect(next.customers.find((x) => x.id === 'c')!.ownership.routeId).toBe('R1');
    expect(base.customers.find((x) => x.id === 'c')!.ownership.routeId).toBe('R2'); // base intact
    expect(scenarioMetrics(next).routeCount).toBe(1); // all on R1 now
  });
  it('leaves unlisted customers untouched', () => {
    const next = applyScenario(base, { id: 's', name: 's', assignments: [{ customerId: 'a', salesmanId: 'sm9' }] });
    expect(next.customers.find((x) => x.id === 'a')!.ownership.salesmanId).toBe('sm9');
    expect(next.customers.find((x) => x.id === 'b')!.ownership.routeId).toBe('R1');
  });
});

describe('compareScenarios', () => {
  it('returns current + each scenario on identical metrics', () => {
    const scenarios: Scenario[] = [
      { id: 'A', name: 'Consolidate', assignments: [{ customerId: 'c', routeId: 'R1' }] },
    ];
    const cmp = compareScenarios(base, scenarios);
    expect(cmp.map((c) => c.id)).toEqual(['current', 'A']);
    expect(cmp[0].metrics.routeCount).toBe(2);
    expect(cmp[1].metrics.routeCount).toBe(1);
    // same customers + workload across scenarios (only routing changed)
    expect(cmp[0].metrics.visits).toBe(cmp[1].metrics.visits);
  });
});
