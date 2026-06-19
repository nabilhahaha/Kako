import { describe, it, expect } from 'vitest';
import { simpleGeoSplit } from './optimize-routes';
import { buildTisDatasetFromRows } from './upload';
import { currentPlanScenario, moveCustomer } from './plan-edit';
import { routeStats, routeExportRows, needsReviewExportRows, unassignedCount, unassignedIds, routeColors, routeIdsOf, convexHull, routeReview, aggregateReview, routeChangeRows, changeSummaryRows, hasSalesData } from './route-planner';
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

describe('Iterative manual correction (move many times before approval)', () => {
  it('moves customers across routes repeatedly; counts and export reflect every move', () => {
    const ds = dataset();
    let sc = scenarioFromSplit(ds, 3);
    const ids0 = routeColors(ds, sc); // R1,R2,R3 ids in sorted order
    const [r1, r2, r3] = [...ids0.keys()];
    const countOf = (s: typeof sc, rid: string) => routeReview(ds, s).find((r) => r.routeId === rid)?.customers ?? 0;

    // Move one customer R1 → R2
    const a = applyScenario(ds, sc).customers.find((c) => c.ownership.routeId === r1)!;
    const r1c0 = countOf(sc, r1), r2c0 = countOf(sc, r2);
    sc = moveCustomer(sc, a.id, r2);
    expect(countOf(sc, r1)).toBe(r1c0 - 1);
    expect(countOf(sc, r2)).toBe(r2c0 + 1);

    // Then move that same customer R2 → R3 (no regenerate)
    sc = moveCustomer(sc, a.id, r3);
    expect(countOf(sc, r2)).toBe(r2c0); // back to original
    expect(applyScenario(ds, sc).customers.find((c) => c.id === a.id)!.ownership.routeId).toBe(r3);

    // Then move a R3 customer to a brand-new route
    sc = moveCustomer(sc, a.id, 'opt-route-new');
    expect(countOf(sc, 'opt-route-new')).toBe(1);

    // Export reflects the final state (customer a sits on the new route).
    const ids = routeIdsOf(ds, sc);
    const rows = routeExportRows(ds, sc, (rid) => (rid ? `Route ${ids.indexOf(rid) + 1}` : 'Unassigned'));
    const aRow = rows.find((r) => String(r[1]) === (a.code ?? a.id));
    expect(aRow).toBeTruthy();
    expect(String(aRow![0])).toBe(`Route ${ids.indexOf('opt-route-new') + 1}`);
  });
});

describe('Select then Apply (selection and moving are separate)', () => {
  it('moves the whole selected set to a target route in one Apply', () => {
    const ds = dataset();
    let sc = scenarioFromSplit(ds, 3);
    const ids = [...routeColors(ds, sc).keys()];
    const [r1, , r3] = ids;
    // "Box/draw/click" select = a set of customer ids; here, all of route 1.
    const selected = applyScenario(ds, sc).customers.filter((c) => c.ownership.routeId === r1).map((c) => c.id);
    expect(selected.length).toBeGreaterThan(0);
    const r3Before = routeReview(ds, sc).find((r) => r.routeId === r3)!.customers;
    // Apply: move the whole selection to r3 (one operation).
    for (const id of selected) sc = moveCustomer(sc, id, r3);
    const after = routeReview(ds, sc);
    expect(after.find((r) => r.routeId === r1)).toBeUndefined(); // route 1 emptied
    expect(after.find((r) => r.routeId === r3)!.customers).toBe(r3Before + selected.length);
  });
});

describe('Distance-aware split (absorption + boundary smoothing)', () => {
  // Two tight cities + a customer midway that is near one city.
  function spread() {
    const rows = [] as Parameters<typeof buildTisDatasetFromRows>[0][number][];
    for (let i = 0; i < 10; i++) rows.push({ code: `A${i}`, name: `A ${i}`, lat: 21.50 + i * 0.003, lng: 39.10 + i * 0.003, frequency: 'weekly' });
    for (let i = 0; i < 10; i++) rows.push({ code: `B${i}`, name: `B ${i}`, lat: 24.70 + i * 0.003, lng: 46.70 + i * 0.003, frequency: 'weekly' });
    return buildTisDatasetFromRows(rows, { source: 'upload' });
  }

  it('absorption: a flagged customer near a route is reclaimed, not left for review', () => {
    const rows = [] as Parameters<typeof buildTisDatasetFromRows>[0][number][];
    for (let i = 0; i < 9; i++) rows.push({ code: `J${i}`, name: `J ${i}`, lat: 21.50 + i * 0.004, lng: 39.10 + i * 0.004, frequency: 'weekly' });
    // ~15 km from the cluster edge — within RP_MAX_ABSORB_KM (25), should be absorbed back.
    rows.push({ code: 'NEAR', name: 'Near', lat: 21.40, lng: 39.05, frequency: 'weekly' });
    const ds = buildTisDatasetFromRows(rows, { source: 'upload' });
    const plan = simpleGeoSplit(ds.customers, 1);
    expect(plan.needsReviewInitial!).toBeGreaterThanOrEqual(plan.needsReview!);
    expect(plan.needsReview).toBe(0); // reclaimed
    expect((plan.needsReviewAbsorbed ?? 0) + plan.routes[0].customers).toBe(ds.customers.length);
  });

  it('boundary smoothing: each city forms its own compact route at K=2', () => {
    const ds = spread();
    const plan = simpleGeoSplit(ds.customers, 2);
    expect(plan.routes.length).toBe(2);
    const sc = plan.assignments.reduce((s, a) => moveCustomer(s, a.customerId, a.routeId ?? null), { id: 'p', name: 'p', assignments: [] as Scenario['assignments'] });
    const rev = routeReview(ds, sc);
    // Compact cities → small radius each, and a non-zero span/mean reported.
    for (const r of rev) {
      expect(r.radiusKm).toBeLessThan(20);
      expect(r.meanRadiusKm).toBeGreaterThanOrEqual(0);
      expect(r.spanKm).toBeGreaterThanOrEqual(0);
    }
  });

  it('exposes flagged/absorbed/final counts and never increases review by absorbing', () => {
    const ds = spread();
    const plan = simpleGeoSplit(ds.customers, 3);
    expect(plan.needsReviewInitial).toBeGreaterThanOrEqual(0);
    expect(plan.needsReview!).toBeLessThanOrEqual(plan.needsReviewInitial!);
  });
});

describe('Current Allocation Review export (Route Changes + Change Summary)', () => {
  function loaded() {
    const rows = [
      { code: 'C1', name: 'A', lat: 21.50, lng: 39.10, route: 'R-3', frequency: 'weekly' },
      { code: 'C2', name: 'B', lat: 21.51, lng: 39.11, route: 'R-3', frequency: 'weekly' },
      { code: 'C3', name: 'C', lat: 21.52, lng: 39.12, route: 'R-7', frequency: 'weekly' },
      { code: 'C4', name: 'D', lat: 21.53, lng: 39.13, frequency: 'weekly' }, // no route → unassigned
    ] as Parameters<typeof buildTisDatasetFromRows>[0][number][];
    // route column maps to routeId via header alias
    return buildTisDatasetFromRows(rows.map((r) => ({ ...r, routeId: (r as { route?: string }).route })), { source: 'upload' });
  }
  const label = (rid: string | null) => rid ?? '';

  it('classifies Moved / Newly Assigned / Unchanged / Needs Review', () => {
    const ds = loaded();
    const base = ds.customers.reduce((s, c) => (c.ownership.routeId ? moveCustomer(s, c.id, c.ownership.routeId) : s), { id: 'b', name: 'b', assignments: [] as Scenario['assignments'] });
    // Working: move C1 from R-3 → R-7 (Moved); assign C4 → R-7 (Newly Assigned); C2 stays (Unchanged); C3 → unassigned (Needs Review)
    let work = base;
    work = moveCustomer(work, ds.customers[0].id, 'R-7');
    work = moveCustomer(work, ds.customers[3].id, 'R-7');
    work = moveCustomer(work, ds.customers[2].id, null);
    const rows = routeChangeRows(ds, base, work, label);
    const byCode = new Map(rows.slice(1).map((r) => [String(r[0]), r] as [string, (string | number)[]]));
    expect(byCode.get('C1')![4]).toBe('Moved');
    expect(String(byCode.get('C1')![2])).toBe('R-3'); // previous
    expect(String(byCode.get('C1')![3])).toBe('R-7'); // new
    expect(byCode.get('C2')![4]).toBe('Unchanged');
    expect(byCode.get('C3')![4]).toBe('Needs Review');
    expect(byCode.get('C4')![4]).toBe('Newly Assigned');
  });

  it('summary totals + per-route before/after/diff', () => {
    const ds = loaded();
    const base = ds.customers.reduce((s, c) => (c.ownership.routeId ? moveCustomer(s, c.id, c.ownership.routeId) : s), { id: 'b', name: 'b', assignments: [] as Scenario['assignments'] });
    let work = moveCustomer(base, ds.customers[0].id, 'R-7'); // C1 R-3 -> R-7
    const sum = changeSummaryRows(ds, base, work, label);
    const flat = new Map(sum.filter((r) => r.length === 2).map((r) => [String(r[0]), Number(r[1])] as [string, number]));
    expect(flat.get('Total customers')).toBe(4);
    expect(flat.get('Moved')).toBe(1);
    // per-route table: R-3 before 2 after 1 diff -1; R-7 before 1 after 2 diff +1
    const r3 = sum.find((r) => r[0] === 'R-3'); const r7 = sum.find((r) => r[0] === 'R-7');
    expect(r3).toEqual(['R-3', 2, 1, -1]);
    expect(r7).toEqual(['R-7', 1, 2, 1]);
  });
});

describe('Sales aggregation (optional)', () => {
  function withSalesDs() {
    const rows = [
      { code: 'A', name: 'A', lat: 21.50, lng: 39.10, frequency: 'weekly', salesValue: 10000 },
      { code: 'B', name: 'B', lat: 21.51, lng: 39.11, frequency: 'weekly', salesValue: 30000 },
      { code: 'C', name: 'C', lat: 24.70, lng: 46.70, frequency: 'weekly', salesValue: 20000 },
      { code: 'D', name: 'D', lat: 24.71, lng: 46.71, frequency: 'weekly', salesValue: 40000 },
    ] as Parameters<typeof buildTisDatasetFromRows>[0][number][];
    return buildTisDatasetFromRows(rows, { source: 'upload' });
  }
  it('hasSalesData true when sales present, false otherwise', () => {
    expect(hasSalesData(withSalesDs())).toBe(true);
    expect(hasSalesData(dataset())).toBe(false);
  });
  it('routeStats sums sales per route; aggregateReview totals + avg', () => {
    const ds = withSalesDs();
    const sc = scenarioFromSplit(ds, 2);
    const stats = routeStats(ds, sc);
    expect(stats.reduce((s, r) => s + r.sales, 0)).toBe(100000);
    const agg = aggregateReview(routeReview(ds, sc), new Set());
    expect(agg.totalSales).toBe(100000);
    expect(agg.avgSalesPerCustomer).toBe(25000);
  });
  it('routeChangeRows/changeSummaryRows add sales columns only with withSales', () => {
    const ds = withSalesDs();
    const base = ds.customers.reduce((s, c) => moveCustomer(s, c.id, 'R1'), { id: 'b', name: 'b', assignments: [] as Scenario['assignments'] });
    const work = moveCustomer(base, ds.customers[0].id, 'R2');
    const plain = routeChangeRows(ds, base, work, (r) => r ?? '');
    const sales = routeChangeRows(ds, base, work, (r) => r ?? '', true);
    expect(plain[0]).toHaveLength(7);
    expect(sales[0]).toHaveLength(10);
    expect(sales[0][7]).toBe('Sales Value');
    const sum = changeSummaryRows(ds, base, work, (r) => r ?? '', true);
    expect(sum.find((r) => r[0] === 'Total sales')).toBeTruthy();
    const head = sum.find((r) => r[0] === 'Route / Salesman')!;
    expect(head).toContain('Sales Diff');
  });
});
