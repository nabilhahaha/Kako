import { describe, it, expect } from 'vitest';
import { balanceRoutes, resolveRouteCount, workingDayList, validateConstraints, validatePlanGeography, territoryCount, clusterTerritories } from './optimize-routes';
import { buildTisCustomer } from './dataset';
import type { VisitFrequency } from '@/lib/route-optimization/visit-frequency';

const weekly: VisitFrequency = { unit: 'week', everyN: 1, visitsPerCycle: 1 };
const triWeekly: VisitFrequency = { unit: 'week', everyN: 1, visitsPerCycle: 3 };
// Two geographic clusters: A around Riyadh-ish, B ~1° east.
const cluster = (id: string, base: number, freq = weekly, sales = 100) =>
  buildTisCustomer({ id, name: id, geo: { lat: 24.7 + base + Math.random() * 0.02, lng: 46.7 + base + Math.random() * 0.02 }, frequency: freq, salesValue: sales });

describe('resolveRouteCount (no hardcoded counts)', () => {
  const cs = Array.from({ length: 10 }, (_, i) => cluster(`c${i}`, 0));
  it('uses an explicit route count', () => { expect(resolveRouteCount(cs, { routeCount: 3 })).toBe(3); });
  it('derives from target per route', () => { expect(resolveRouteCount(cs, { targetPerRoute: 4 })).toBe(3); }); // ceil(10/4)
  it('derives from workload capacity', () => {
    // 10 customers × 1 visit/wk = 10; capacity = 2/day × 5 = 10 ⇒ 1 route.
    expect(resolveRouteCount(cs, { maxVisitsPerDay: 2, workingDays: 5 })).toBe(1);
  });
  it('empty ⇒ 0', () => { expect(resolveRouteCount([], {})).toBe(0); });
});

describe('balanceRoutes', () => {
  it('assigns every customer to exactly one of K routes', () => {
    const cs = Array.from({ length: 12 }, (_, i) => cluster(`c${i}`, i < 6 ? 0 : 1));
    const plan = balanceRoutes(cs, { routeCount: 2 });
    expect(plan.routeCount).toBe(2);
    expect(plan.assignments).toHaveLength(12);
    expect(new Set(plan.assignments.map((a) => a.customerId)).size).toBe(12);
    expect(plan.routes.reduce((s, r) => s + r.customers, 0)).toBe(12);
  });

  it('balances by workload, not count (heavy customers spread out)', () => {
    // 4 heavy (3/wk) + 8 light (1/wk) → 2 routes should split workload evenly (~10 each),
    // which means uneven COUNTS — proving it balances load not headcount.
    const cs = [
      ...Array.from({ length: 4 }, (_, i) => cluster(`h${i}`, 0, triWeekly)),
      ...Array.from({ length: 8 }, (_, i) => cluster(`l${i}`, 1, weekly)),
    ];
    const plan = balanceRoutes(cs, { routeCount: 2 });
    expect(plan.workloadBalancePct).toBeGreaterThan(70);
    const loads = plan.routes.map((r) => r.workload);
    expect(Math.abs(loads[0] - loads[1])).toBeLessThanOrEqual(4); // close workloads
  });

  it('respects maxPerRoute hard cap', () => {
    const cs = Array.from({ length: 10 }, (_, i) => cluster(`c${i}`, 0));
    const plan = balanceRoutes(cs, { routeCount: 2, maxPerRoute: 6 });
    for (const r of plan.routes) expect(r.customers).toBeLessThanOrEqual(6);
  });

  it('geo-less customers are still assigned', () => {
    const cs = [cluster('a', 0), buildTisCustomer({ id: 'b', name: 'b', frequency: weekly })];
    const plan = balanceRoutes(cs, { routeCount: 2 });
    expect(plan.assignments).toHaveLength(2);
  });

  it('empty set ⇒ empty plan', () => {
    expect(balanceRoutes([], {}).routes).toHaveLength(0);
  });

  it('distributes each route across the working days (calendar populated)', () => {
    const cs = Array.from({ length: 30 }, (_, i) => cluster(`c${i}`, i < 15 ? 0 : 1));
    const plan = balanceRoutes(cs, { routeCount: 2, workingDays: 5 });
    // Every assignment carries a day, and only the 5 working days are used.
    const days = workingDayList(5);
    expect(plan.assignments.every((a) => a.dayOfWeek && days.includes(a.dayOfWeek))).toBe(true);
    // Both routes spread their customers across multiple days (not one pile).
    for (const r of plan.routes) {
      const routeDays = new Set(plan.assignments.filter((a) => a.routeId === r.routeId).map((a) => a.dayOfWeek));
      expect(routeDays.size).toBeGreaterThan(1);
    }
  });
});

describe('validateConstraints (feasibility + recommendation)', () => {
  const many = Array.from({ length: 100 }, (_, i) => cluster(`c${i}`, 0)); // 100 customers, 1 visit/wk each
  it('feasible when no caps', () => {
    const r = validateConstraints(many, { routeCount: 5 });
    expect(r.feasible).toBe(true);
    expect(r.recommendedRoutes).toBe(1);
    expect(r.bind).toBeNull();
  });
  it('infeasible by max customers/route → recommends enough routes', () => {
    // 100 customers, max 20/route, requested 3 → need ceil(100/20)=5.
    const r = validateConstraints(many, { routeCount: 3, maxPerRoute: 20 });
    expect(r.feasible).toBe(false);
    expect(r.recommendedRoutes).toBe(5);
    expect(r.bind).toBe('customers');
  });
  it('feasible when requested ≥ recommended', () => {
    expect(validateConstraints(many, { routeCount: 5, maxPerRoute: 20 }).feasible).toBe(true);
  });
  it('infeasible by max visits/day capacity', () => {
    // 100 visits/wk; cap 5/day × 4 days = 20/route → need ceil(100/20)=5 routes.
    const r = validateConstraints(many, { routeCount: 2, maxVisitsPerDay: 5, workingDays: 4 });
    expect(r.feasible).toBe(false);
    expect(r.recommendedRoutes).toBe(5);
    expect(r.bind).toBe('visits');
  });
});

describe('geography is a HARD constraint (Jeddah / Riyadh / Dammam)', () => {
  // ~6000 customers across three distant cities (hundreds of km apart).
  const CITIES = { jeddah: { lat: 21.54, lng: 39.19 }, riyadh: { lat: 24.71, lng: 46.68 }, dammam: { lat: 26.43, lng: 50.10 } };
  const make = (city: keyof typeof CITIES, n: number) =>
    Array.from({ length: n }, (_, i) => {
      const b = CITIES[city];
      return buildTisCustomer({ id: `${city}-${i}`, name: `${city}-${i}`, geo: { lat: b.lat + (Math.random() - 0.5) * 0.3, lng: b.lng + (Math.random() - 0.5) * 0.3 }, frequency: weekly, salesValue: 100 });
    });
  const all = [...make('jeddah', 2200), ...make('riyadh', 2000), ...make('dammam', 1800)];

  it('detects three distinct territories', () => {
    expect(territoryCount(all)).toBe(3);
  });

  it('NEVER mixes cities in a route (default hard partition)', () => {
    const plan = balanceRoutes(all, { routeCount: 8 });
    const terr = clusterTerritories(all);
    const byId = new Map(all.map((c) => [c.id, c]));
    const routeTerr = new Map<string, Set<string>>();
    for (const a of plan.assignments) {
      const t = terr.get(a.customerId);
      if (a.routeId && t) (routeTerr.get(a.routeId) ?? routeTerr.set(a.routeId, new Set()).get(a.routeId)!).add(t);
    }
    for (const set of routeTerr.values()) expect(set.size).toBe(1); // each route = one city
    void byId;
  });

  it('validatePlanGeography reports VALID with no mixed routes', () => {
    const plan = balanceRoutes(all, { routeCount: 8 });
    const v = validatePlanGeography(all, plan.assignments);
    expect(v.valid).toBe(true);
    expect(v.invalidCount).toBe(0);
    expect(v.territories).toBe(3);
    expect(v.routes.every((r) => r.cities === 1)).toBe(true);
  });

  it('the OLD cross-territory mode would mix cities → flagged invalid', () => {
    const plan = balanceRoutes(all, { routeCount: 8, crossTerritory: true });
    const v = validatePlanGeography(all, plan.assignments);
    // With a single cross-city pass, at least one route spans multiple cities.
    expect(v.invalidCount).toBeGreaterThan(0);
    expect(v.valid).toBe(false);
  });
});

describe('workingDayList', () => {
  it('returns the first N business days (Sun–Thu work week)', () => {
    expect(workingDayList(5)).toEqual(['sun', 'mon', 'tue', 'wed', 'thu']);
    expect(workingDayList(6)).toEqual(['sun', 'mon', 'tue', 'wed', 'thu', 'sat']);
  });
  it('clamps out-of-range counts', () => {
    expect(workingDayList(0)).toHaveLength(5); // 0 → default 5
    expect(workingDayList(9)).toHaveLength(7);
  });
});
