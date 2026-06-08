import { describe, it, expect } from 'vitest';
import {
  ROUTE_OPTIMIZATION_ENABLED,
  DEFAULT_FREQUENCY_RULES, visitsPerWeekFor, intervalFor, visitDaysFor,
  optimizeRoute, totalTravel,
  analyzeBalance,
  pointInPolygon, customerInTerritory, assignTerritories, planTerritorySplit, planTerritoryMerge,
  navigationUrl, openRouteUrl, MAP_PROVIDERS,
  prioritizeCollectionRoute, prioritizeVanRoute, prioritizeMerchRoute, prioritizeRidingRoute,
  generateWeeklyPlan,
  recommendFromBalance, recommendFrequencyChanges,
  salesmanRouteDashboard, supervisorRouteDashboard, managementRouteDashboard,
} from './index';

describe('route-optimization/flags', () => {
  it('defaults OFF', () => {
    const prev = process.env.KAKO_ROUTE_OPTIMIZATION;
    delete process.env.KAKO_ROUTE_OPTIMIZATION;
    expect(ROUTE_OPTIMIZATION_ENABLED()).toBe(false);
    process.env.KAKO_ROUTE_OPTIMIZATION = '1';
    expect(ROUTE_OPTIMIZATION_ENABLED()).toBe(true);
    if (prev === undefined) delete process.env.KAKO_ROUTE_OPTIMIZATION; else process.env.KAKO_ROUTE_OPTIMIZATION = prev;
  });
});

describe('frequency engine (no hardcoded frequencies)', () => {
  it('resolves visits/week from rules + buckets intervals', () => {
    expect(visitsPerWeekFor(DEFAULT_FREQUENCY_RULES, 'a')).toBe(3);
    expect(visitsPerWeekFor(DEFAULT_FREQUENCY_RULES, 'd')).toBe(0.5);
    expect(visitsPerWeekFor(DEFAULT_FREQUENCY_RULES, 'z')).toBeNull();
    expect(intervalFor(3)).toBe('multi_weekly');
    expect(intervalFor(1)).toBe('weekly');
    expect(intervalFor(0.5)).toBe('biweekly');
  });
  it('spreads visit days across working days', () => {
    const days = ['sat', 'sun', 'mon', 'tue', 'wed'];
    expect(visitDaysFor(2, days)).toHaveLength(2);
    expect(visitDaysFor(0.5, days)).toEqual(['sat']);
    expect(visitDaysFor(9, days)).toEqual(days);
  });
});

describe('optimizer (reuses journey-sort)', () => {
  const cs = [
    { customerId: 'A', latitude: 0, longitude: 0 },
    { customerId: 'B', latitude: 0, longitude: 0.1 },
    { customerId: 'C', latitude: 0, longitude: 0.05 },
  ];
  it('optimized order is nearest-neighbour from origin and shorter than worst order', () => {
    const origin = { latitude: 0, longitude: 0 };
    const opt = optimizeRoute(cs, origin, 'optimized');
    expect(opt.order.map((o) => o.customerId)).toEqual(['A', 'C', 'B']);
    expect(opt.totalDistanceM).toBeGreaterThan(0);
    expect(opt.stopCount).toBe(3);
    const naive = totalTravel([cs[0], cs[1], cs[2]], origin); // A,B,C = backtrack
    expect(opt.totalDistanceM).toBeLessThanOrEqual(naive);
  });
});

describe('balancing', () => {
  it('flags overloaded + underutilized vs mean', () => {
    const res = analyzeBalance([
      { routeId: 'R1', customerCount: 100 },
      { routeId: 'R2', customerCount: 50 },
      { routeId: 'R3', customerCount: 60 },
    ], 'customer_count', 20);
    expect(res.overloaded).toContain('R1');
    expect(res.underutilized).toContain('R2');
  });
});

describe('territory (city/area/polygon)', () => {
  const square = [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 2 }, { latitude: 2, longitude: 2 }, { latitude: 2, longitude: 0 }];
  it('point-in-polygon + membership', () => {
    expect(pointInPolygon({ latitude: 1, longitude: 1 }, square)).toBe(true);
    expect(pointInPolygon({ latitude: 3, longitude: 3 }, square)).toBe(false);
    expect(customerInTerritory({ customerId: 'c', city: 'Riyadh' }, { id: 't', kind: 'city', cities: ['Riyadh'] })).toBe(true);
    expect(customerInTerritory({ customerId: 'c', latitude: 1, longitude: 1 }, { id: 't', kind: 'polygon', polygon: square })).toBe(true);
  });
  it('split is balanced; merge reassigns', () => {
    const split = planTerritorySplit([{ customerId: 'a', weight: 3 }, { customerId: 'b', weight: 1 }, { customerId: 'c', weight: 1 }], 2);
    expect(new Set(split.map((s) => s.bucket)).size).toBe(2);
    const merge = planTerritoryMerge([{ customerId: 'x', territoryId: 'T1' }, { customerId: 'y', territoryId: 'T2' }], ['T1'], 'T2');
    expect(merge).toEqual([{ customerId: 'x', territoryId: 'T2' }]);
    expect(assignTerritories([{ customerId: 'c', city: 'Jeddah' }], [{ id: 't', kind: 'city', cities: ['Jeddah'] }])[0].territoryId).toBe('t');
  });
});

describe('maps (no vendor lock-in)', () => {
  it('builds provider deep links', () => {
    const dest = { latitude: 24.7, longitude: 46.7 };
    expect(navigationUrl('google', dest)).toContain('google.com/maps/dir');
    expect(navigationUrl('apple', dest)).toContain('maps.apple.com');
    expect(navigationUrl('waze', dest)).toContain('waze.com');
    expect(openRouteUrl('google', [dest, { latitude: 24.8, longitude: 46.8 }])).toContain('destination=');
    expect(MAP_PROVIDERS).toContain('waze');
  });
});

describe('specialized route prioritizers', () => {
  it('collection prioritizes overdue + PTP', () => {
    const r = prioritizeCollectionRoute([
      { customerId: 'A', overdueAmount: 1000, balance: 2000, promiseToPay: true },
      { customerId: 'B', overdueAmount: 0, balance: 100 },
    ]);
    expect(r[0].customerId).toBe('A');
  });
  it('van respects capacity', () => {
    const r = prioritizeVanRoute([{ customerId: 'A', expectedDemandUnits: 60, revenuePotential: 100 }, { customerId: 'B', expectedDemandUnits: 60, revenuePotential: 50 }], 100);
    expect(r[0].withinCapacity).toBe(true);
    expect(r[1].withinCapacity).toBe(false);
  });
  it('merch + riding rank worst-execution / weakest-rep first', () => {
    expect(prioritizeMerchRoute([{ customerId: 'A', oosRisk: 90, mslGapPct: 80, perfectStoreScore: 20 }, { customerId: 'B', oosRisk: 0, mslGapPct: 0, perfectStoreScore: 100 }])[0].customerId).toBe('A');
    expect(prioritizeRidingRoute([{ salesmanId: 'S1', performanceScore: 20, routeCompliancePct: 30, newJoiner: true }, { salesmanId: 'S2', performanceScore: 95, routeCompliancePct: 98 }])[0].salesmanId).toBe('S1');
  });
});

describe('journey plan generator', () => {
  it('schedules by frequency + optimizes each day', () => {
    const plan = generateWeeklyPlan(
      [{ customerId: 'A', classification: 'a', latitude: 0, longitude: 0 }, { customerId: 'B', classification: 'c', latitude: 0, longitude: 0.1 }],
      DEFAULT_FREQUENCY_RULES, ['sat', 'sun', 'mon'],
    );
    expect(plan).toHaveLength(3);
    const totalScheduled = plan.reduce((s, d) => s + d.customerIds.length, 0);
    expect(totalScheduled).toBeGreaterThanOrEqual(3); // A (3/wk) + B (1/wk)
  });
});

describe('recommendations + dashboards', () => {
  it('recommends from balance + frequency mismatch', () => {
    const bal = analyzeBalance([{ routeId: 'R1', salesValue: 1000 }, { routeId: 'R2', salesValue: 100 }], 'sales_value', 20);
    const recs = recommendFromBalance(bal);
    expect(recs.some((r) => r.subjectId === 'R1')).toBe(true);
    expect(recommendFrequencyChanges([{ customerId: 'C', classification: 'a', expectedVisitsPerWeek: 3, actualVisitsPerWeek: 1 }])[0].type).toBe('frequency_change');
  });
  it('dashboards roll up', () => {
    const routes = [{ routeId: 'R1', salesmanId: 'S1', plannedCalls: 10, actualCalls: 8, productiveCalls: 6, travelTimeMin: 120, totalDistanceM: 40000, revenue: 5000, territoryId: 'T1' }];
    expect(salesmanRouteDashboard(routes, 'S1').coveragePct).toBe(80);
    expect(supervisorRouteDashboard(routes).teamCompliancePct).toBe(80);
    expect(managementRouteDashboard(routes).revenueByRoute[0].revenue).toBe(5000);
  });
});
