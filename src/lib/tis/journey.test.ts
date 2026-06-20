import { describe, it, expect } from 'vitest';
import {
  generateJourneyPlan,
  computeDayLoads,
  journeyExportRows,
  journeyRouteKpis,
  validateJourneyPlan,
  dayColorOf,
  JOURNEY_DAY_COLORS,
  visitsPerCycle,
  weeksForCadence,
  weekPatternLabel,
  daysPerWeek,
  JOURNEY_WORKING_DAYS,
  type JourneyCustomer,
  type JourneyExportCustomer,
  type JourneyRoutedCustomer,
} from './journey';

// Two tight geographic clusters: west (lng ~46.6) and east (lng ~46.8).
function grid(): JourneyCustomer[] {
  const cs: JourneyCustomer[] = [];
  let n = 0;
  for (const baseLng of [46.60, 46.82]) {
    for (let i = 0; i < 12; i++) {
      cs.push({ id: `c${n++}`, lat: 24.70 + (i % 4) * 0.005, lng: baseLng + Math.floor(i / 4) * 0.004, frequency: 'w1' });
    }
  }
  return cs;
}

describe('journey frequency math', () => {
  it('maps frequencies to visits per 4-week cycle', () => {
    expect(visitsPerCycle('daily')).toBe(JOURNEY_WORKING_DAYS.length * 4);
    expect(visitsPerCycle('w3')).toBe(12);
    expect(visitsPerCycle('w1')).toBe(4);
    expect(visitsPerCycle('biweekly')).toBe(2);
    expect(visitsPerCycle('monthly')).toBe(1);
    expect(visitsPerCycle('every10')).toBe(3);
  });

  it('spreads biweekly across week 1&3 / 2&4 and monthly across weeks', () => {
    expect(weeksForCadence('biweekly', 0)).toEqual([1, 3]);
    expect(weeksForCadence('biweekly', 1)).toEqual([2, 4]);
    expect(weeksForCadence('monthly', 0)).toEqual([1]);
    expect(weeksForCadence('monthly', 2)).toEqual([3]);
    expect(weekPatternLabel([1, 3])).toBe('Week 1 & Week 3');
    expect(weekPatternLabel([1, 2, 3, 4])).toBe('Weekly');
  });
});

describe('generateJourneyPlan', () => {
  it('assigns each customer the right number of weekday slots', () => {
    const plan = generateJourneyPlan(grid());
    for (const a of plan.assignments.values()) {
      expect(a.days.length).toBe(daysPerWeek(a.frequency));
    }
  });

  it('keeps same-day customers geographically close (clusters do not mix clusters)', () => {
    // All weekly (1×) so each customer gets exactly one day = its geographic cluster.
    const cs = grid();
    const plan = generateJourneyPlan(cs);
    const byId = new Map(cs.map((c) => [c.id, c]));
    // For each day, the assigned customers should share the same side (west vs east).
    const sideByDay = new Map<string, Set<string>>();
    for (const a of plan.assignments.values()) {
      const side = byId.get(a.customerId)!.lng < 46.71 ? 'W' : 'E';
      for (const d of a.days) {
        if (!sideByDay.has(d)) sideByDay.set(d, new Set());
        sideByDay.get(d)!.add(side);
      }
    }
    // No working day should mix both the west and east cluster for 1×/week customers.
    for (const sides of sideByDay.values()) expect(sides.size).toBe(1);
  });

  it('balances daily workload (no day grossly overloaded)', () => {
    const plan = generateJourneyPlan(grid());
    const active = plan.dayLoads.filter((d) => d.customers > 0);
    const counts = active.map((d) => d.customers);
    const max = Math.max(...counts), min = Math.min(...counts);
    expect(max - min).toBeLessThanOrEqual(3);
  });

  it('multi-visit frequencies use multiple distinct days', () => {
    const cs: JourneyCustomer[] = grid().map((c, i) => (i === 0 ? { ...c, frequency: 'w3' } : c));
    const plan = generateJourneyPlan(cs);
    const a = plan.assignments.get('c0')!;
    expect(a.days.length).toBe(3);
    expect(new Set(a.days).size).toBe(3);
  });
});

describe('day colours', () => {
  it('gives every working day a distinct colour', () => {
    const colours = JOURNEY_WORKING_DAYS.map((d) => dayColorOf(d));
    expect(new Set(colours).size).toBe(JOURNEY_WORKING_DAYS.length);
    expect(Object.keys(JOURNEY_DAY_COLORS).length).toBe(6);
  });
});

describe('journeyRouteKpis', () => {
  it('reports per-route customers, visits, distance and balance', () => {
    const cs: JourneyRoutedCustomer[] = grid().map((c, i) => ({ ...c, routeId: i < 12 ? 'R-W' : 'R-E' }));
    const plan = generateJourneyPlan(cs);
    const kpis = journeyRouteKpis(cs, plan);
    expect(kpis.map((k) => k.routeId).sort()).toEqual(['R-E', 'R-W']);
    for (const k of kpis) {
      expect(k.customers).toBe(12);
      expect(k.visitsPerCycle).toBe(12 * 4); // all 1×/week → 4 visits/cycle each
      expect(k.distanceKm).toBeGreaterThanOrEqual(0);
      expect(k.workloadBalance).toBeGreaterThanOrEqual(0);
      expect(k.workloadBalance).toBeLessThanOrEqual(100);
    }
  });
});

describe('validateJourneyPlan', () => {
  it('flags a frequency that is not satisfied and a customer with no visit day', () => {
    const cs: JourneyRoutedCustomer[] = grid().map((c) => ({ ...c, routeId: 'R1' }));
    const plan = generateJourneyPlan(cs);
    // Corrupt one assignment: remove its day.
    const a = plan.assignments.get('c0')!;
    plan.assignments.set('c0', { ...a, days: [] });
    const w = validateJourneyPlan(cs, plan);
    expect(w.some((x) => x.kind === 'no_visit_day' && x.customerId === 'c0')).toBe(true);
  });

  it('returns no critical warnings for a clean compact plan', () => {
    const cs: JourneyRoutedCustomer[] = grid().map((c) => ({ ...c, routeId: c.lng < 46.71 ? 'R-W' : 'R-E' }));
    const plan = generateJourneyPlan(cs);
    const w = validateJourneyPlan(cs, plan);
    expect(w.some((x) => x.kind === 'no_visit_day')).toBe(false);
    expect(w.some((x) => x.kind === 'duplicate_day')).toBe(false);
  });
});

describe('journeyExportRows', () => {
  it('emits one row per customer-day with the required columns', () => {
    const cs = grid();
    const plan = generateJourneyPlan(cs);
    const ex: JourneyExportCustomer[] = cs.map((c) => ({ ...c, code: c.id.toUpperCase(), name: `Cust ${c.id}`, routeLabel: 'Route 1', sales: 1000 }));
    const rows = journeyExportRows(ex, plan, (d) => d, true);
    expect(rows[0]).toEqual(['Route / Salesman', 'Customer Code', 'Customer Name', 'Frequency', 'Visit Day', 'Week Pattern', 'Visit Count', 'Sequence', 'Latitude', 'Longitude', 'Sales']);
    // 24 customers, all 1×/week → 24 data rows.
    expect(rows.length).toBe(1 + 24);
    expect(computeDayLoads(cs, plan.assignments).reduce((s, d) => s + d.customers, 0)).toBe(24);
  });
});
