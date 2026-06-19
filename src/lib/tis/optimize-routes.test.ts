import { describe, it, expect } from 'vitest';
import { balanceRoutes, resolveRouteCount, workingDayList } from './optimize-routes';
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
