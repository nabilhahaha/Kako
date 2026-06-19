import { describe, it, expect } from 'vitest';
import { simpleGeoSplit } from './optimize-routes';
import { buildTisDatasetFromRows } from './upload';
import { currentPlanScenario, moveCustomer } from './plan-edit';
import { routeStats, routeExportRows, needsReviewExportRows, unassignedCount, unassignedIds, routeColors, convexHull, routeReview, aggregateReview } from './route-planner';
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
  it('emits a header + one row per ASSIGNED customer with route label, code, name, freq, geo', () => {
    const ds = dataset();
    const scenario = scenarioFromSplit(ds, 2);
    const colors = routeColors(ds, scenario);
    const ids = [...colors.keys()];
    const label = (rid: string | null) => (rid ? `Route ${ids.indexOf(rid) + 1}` : 'Unassigned');
    const rows = routeExportRows(ds, scenario, label);
    expect(rows[0]).toEqual(['Route', 'Customer Code', 'Customer Name', 'Frequency', 'Latitude', 'Longitude']);
    // Tight clusters → nothing flagged → all 12 assigned.
    expect(rows.length).toBe(ds.customers.length + 1);
    for (const r of rows.slice(1)) {
      expect(String(r[0])).toMatch(/^Route /);
      expect(String(r[1])).toBeTruthy();
    }
  });
});

// A tight cluster + one far highway outlier in the same slice.
function datasetWithOutlier() {
  const rows = [] as Parameters<typeof buildTisDatasetFromRows>[0][number][];
  for (let i = 0; i < 8; i++) rows.push({ code: `J${i}`, name: `Jeddah ${i}`, lat: 21.5 + i * 0.005, lng: 39.1 + i * 0.005, frequency: 'weekly' });
  rows.push({ code: 'HW1', name: 'Highway stop', lat: 23.9, lng: 42.8, frequency: 'weekly' }); // ~350 km away
  return buildTisDatasetFromRows(rows, { source: 'upload' });
}

describe('Needs Review (remote-outlier flagging)', () => {
  it('pulls a far highway customer out of the route into Needs Review', () => {
    const ds = datasetWithOutlier();
    const plan = simpleGeoSplit(ds.customers, 1);
    expect(plan.needsReview).toBe(1);
    // The flagged customer carries an explicit null route assignment.
    const hw = ds.customers.find((c) => c.code === 'HW1')!;
    expect(plan.assignments.find((a) => a.customerId === hw.id)?.routeId).toBeNull();
    // The route excludes it.
    expect(plan.routes[0].customerIds).not.toContain(hw.id);
  });

  it('keeps the outlier unassigned in the scenario and lists it on the Needs Review sheet', () => {
    const ds = datasetWithOutlier();
    const plan = simpleGeoSplit(ds.customers, 1);
    const scenario = plan.assignments.reduce((sc, a) => moveCustomer(sc, a.customerId, a.routeId ?? null), { id: 'p', name: 'p', assignments: [] as Scenario['assignments'] });
    expect(unassignedCount(ds, scenario)).toBe(1);
    expect(unassignedIds(ds, scenario)).toHaveLength(1);
    const review = needsReviewExportRows(ds, scenario);
    expect(review[0][0]).toBe('Route'); // header
    expect(review.length).toBe(2); // header + 1
    expect(review[1][0]).toBe('Needs Review');
    expect(String(review[1][1])).toBe('HW1');
  });

  it('does not flag anything when flagRemote is disabled', () => {
    const ds = datasetWithOutlier();
    const plan = simpleGeoSplit(ds.customers, 1, { flagRemote: false });
    expect(plan.needsReview).toBe(0);
  });

  it('never strips small slices below the minimum (regression guard)', () => {
    // 4 customers, K=1 → slice of 4 (< RP_MIN_SLICE=5) is never stripped even with spread.
    const rows = [
      { code: 'A', name: 'A', lat: 21.5, lng: 39.1, frequency: 'weekly' },
      { code: 'B', name: 'B', lat: 21.51, lng: 39.11, frequency: 'weekly' },
      { code: 'C', name: 'C', lat: 21.52, lng: 39.12, frequency: 'weekly' },
      { code: 'FAR', name: 'Far', lat: 24.0, lng: 43.0, frequency: 'weekly' },
    ];
    const ds = buildTisDatasetFromRows(rows, { source: 'upload' });
    const plan = simpleGeoSplit(ds.customers, 1);
    expect(plan.needsReview).toBe(0);
  });
});

describe('convexHull', () => {
  it('returns a hull ring enclosing a square cloud', () => {
    const hull = convexHull([
      { lng: 0, lat: 0 }, { lng: 0, lat: 1 }, { lng: 1, lat: 0 }, { lng: 1, lat: 1 }, { lng: 0.5, lat: 0.5 },
    ]);
    // The interior point is excluded; the 4 corners form the hull.
    expect(hull.length).toBe(4);
  });
  it('returns the points themselves when fewer than 3', () => {
    expect(convexHull([{ lng: 0, lat: 0 }, { lng: 1, lat: 1 }]).length).toBe(2);
  });
});

describe('routeReview & aggregateReview', () => {
  it('adds radius, compactness and a hull per route', () => {
    const ds = dataset();
    const scenario = scenarioFromSplit(ds, 2);
    const reviews = routeReview(ds, scenario);
    expect(reviews.length).toBe(2);
    for (const r of reviews) {
      expect(r.radiusKm).toBeGreaterThanOrEqual(0);
      expect(r.compactness).toBeGreaterThanOrEqual(0);
      expect(r.compactness).toBeLessThanOrEqual(100);
      expect(Array.isArray(r.hull)).toBe(true);
    }
  });
  it('aggregates over focused routes (and all when focus is empty)', () => {
    const ds = dataset();
    const scenario = scenarioFromSplit(ds, 2);
    const reviews = routeReview(ds, scenario);
    const all = aggregateReview(reviews, new Set());
    expect(all.routes).toBe(2);
    expect(all.customers).toBe(ds.customers.length);
    const one = aggregateReview(reviews, new Set([reviews[0].routeId]));
    expect(one.routes).toBe(1);
    expect(one.customers).toBe(reviews[0].customers);
  });
});

describe('Manual Territory Design (data path)', () => {
  it('draws territories from a blank plan: each drawn set becomes a new route', () => {
    const ds = dataset(); // 6 Jeddah + 6 Riyadh
    // Manual mode starts blank — everyone unassigned.
    let sc = ds.customers.reduce((s, c) => moveCustomer(s, c.id, null), { id: 'm', name: 'm', assignments: [] as Scenario['assignments'] });
    expect(unassignedCount(ds, sc)).toBe(12);
    // Draw territory 1 → the 6 Jeddah customers become a new route.
    const jeddah = ds.customers.filter((c) => c.name.startsWith('Jeddah')).map((c) => c.id);
    for (const id of jeddah) sc = moveCustomer(sc, id, 'opt-route-1');
    let reviews = routeReview(ds, sc);
    expect(reviews.length).toBe(1);
    expect(reviews[0].customers).toBe(6);
    expect(unassignedCount(ds, sc)).toBe(6);
    // Draw territory 2 → the 6 Riyadh customers become a second route.
    const riyadh = ds.customers.filter((c) => c.name.startsWith('Riyadh')).map((c) => c.id);
    for (const id of riyadh) sc = moveCustomer(sc, id, 'opt-route-2');
    reviews = routeReview(ds, sc);
    expect(reviews.length).toBe(2);
    expect(unassignedCount(ds, sc)).toBe(0);
  });
});
