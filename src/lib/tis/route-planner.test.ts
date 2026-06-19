import { describe, it, expect } from 'vitest';
import { simpleGeoSplit } from './optimize-routes';
import { buildTisDatasetFromRows } from './upload';
import { currentPlanScenario, moveCustomer } from './plan-edit';
import { routeStats, routeExportRows, unassignedCount, routeColors } from './route-planner';
import { applyScenario, type Scenario } from './scenario';

// Two tight clusters (Jeddah ~21.5/39.1 and Riyadh ~24.7/46.7), 6 each.
function dataset() {
  const rows = [] as Parameters<typeof buildTisDatasetFromRows>[0][number][];
  for (let i = 0; i < 6; i++) rows.push({ code: `J${i}`, name: `Jeddah ${i}`, lat: 21.5 + i * 0.01, lng: 39.1 + i * 0.01, frequency: 'weekly' });
  for (let i = 0; i < 6; i++) rows.push({ code: `R${i}`, name: `Riyadh ${i}`, lat: 24.7 + i * 0.01, lng: 46.7 + i * 0.01, frequency: '2' });
  return buildTisDatasetFromRows(rows, { source: 'upload' });
}

function scenarioFromSplit(ds: ReturnType<typeof dataset>, k: number): Scenario {
  const plan = simpleGeoSplit(ds.customers, k);
  return plan.assignments.reduce((sc, a) => moveCustomer(sc, a.customerId, a.routeId ?? null), { id: 'plan', name: 'Plan', assignments: [] as Scenario['assignments'] });
}

describe('simpleGeoSplit', () => {
  it('produces exactly K routes when K ≤ customer count', () => {
    const ds = dataset();
    for (const k of [2, 3, 4]) {
      const plan = simpleGeoSplit(ds.customers, k);
      expect(plan.routes.length).toBe(k);
      // Every customer assigned to some route.
      expect(plan.assignments.filter((a) => a.routeId).length).toBe(ds.customers.length);
    }
  });

  it('never returns more than the requested K (no forced extra routes)', () => {
    const ds = dataset();
    const plan = simpleGeoSplit(ds.customers, 2);
    expect(plan.routes.length).toBeLessThanOrEqual(2);
    expect(plan.geographyRequiresRoutes).toBeNull();
  });

  it('caps K at the customer count', () => {
    const ds = dataset();
    const plan = simpleGeoSplit(ds.customers, 999);
    expect(plan.routes.length).toBeLessThanOrEqual(ds.customers.length);
  });
});

describe('routeStats', () => {
  it('reports count, weekly visits and workload hours per route', () => {
    const ds = dataset();
    const scenario = scenarioFromSplit(ds, 2);
    const stats = routeStats(ds, scenario);
    expect(stats.length).toBe(2);
    for (const s of stats) {
      expect(s.customers).toBeGreaterThan(0);
      expect(s.weeklyVisits).toBeGreaterThan(0);
      expect(s.workloadHours).toBeGreaterThan(0);
      expect(s.color).toMatch(/^#/);
    }
    // Total customers across routes equals the dataset (all assigned).
    expect(stats.reduce((n, s) => n + s.customers, 0)).toBe(ds.customers.length);
  });

  it('reflects a manual move between routes', () => {
    const ds = dataset();
    let scenario = scenarioFromSplit(ds, 2);
    const before = routeStats(ds, scenario);
    const fromRoute = before[0].routeId;
    const toRoute = before[1].routeId;
    const moved = applyScenario(ds, scenario).customers.find((c) => c.ownership.routeId === fromRoute)!;
    scenario = moveCustomer(scenario, moved.id, toRoute);
    const after = routeStats(ds, scenario);
    expect(after.find((s) => s.routeId === fromRoute)!.customers).toBe(before[0].customers - 1);
    expect(after.find((s) => s.routeId === toRoute)!.customers).toBe(before[1].customers + 1);
  });
});

describe('unassignedCount', () => {
  it('counts customers with no route', () => {
    const ds = dataset();
    const empty = currentPlanScenario(ds); // no route ownership in upload → all unassigned
    expect(unassignedCount(ds, empty)).toBe(ds.customers.length);
    const scenario = scenarioFromSplit(ds, 3);
    expect(unassignedCount(ds, scenario)).toBe(0);
  });
});

describe('routeExportRows', () => {
  it('emits a header + one row per customer with route label, code, name, freq, geo', () => {
    const ds = dataset();
    const scenario = scenarioFromSplit(ds, 2);
    const colors = routeColors(ds, scenario);
    const ids = [...colors.keys()];
    const label = (rid: string | null) => (rid ? `Route ${ids.indexOf(rid) + 1}` : 'Unassigned');
    const rows = routeExportRows(ds, scenario, label);
    expect(rows[0]).toEqual(['Route', 'Customer Code', 'Customer Name', 'Frequency', 'Latitude', 'Longitude']);
    expect(rows.length).toBe(ds.customers.length + 1);
    // Each data row has a non-empty route label and a code.
    for (const r of rows.slice(1)) {
      expect(String(r[0])).toMatch(/^Route /);
      expect(String(r[1])).toBeTruthy();
    }
  });
});
