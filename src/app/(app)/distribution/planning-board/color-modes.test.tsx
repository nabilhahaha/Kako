import { describe, it, expect } from 'vitest';
import { buildTisDataset, buildTisCustomer } from '@/lib/tis/dataset';
import { currentPlanScenario, reassignDay } from '@/lib/tis/plan-edit';
import { buildColorContext, colorOf, modeAvailability, legendFor } from './color-modes';
import type { VisitFrequency } from '@/lib/route-optimization/visit-frequency';

const weekly: VisitFrequency = { unit: 'week', everyN: 1, visitsPerCycle: 1 };
const cust = (id: string, over: Partial<Parameters<typeof buildTisCustomer>[0]> = {}) =>
  buildTisCustomer({ id, name: id, geo: { lat: 21.5 + Math.random() * 0.1, lng: 39.2 + Math.random() * 0.1 }, frequency: weekly, ...over });

const ds = buildTisDataset([
  cust('a', { ownership: { routeId: 'R1', salesmanId: 'S1', regionId: 'r', supervisorId: null, areaId: null }, grade: 'a', coverage: 'on_track' }),
  cust('b', { ownership: { routeId: 'R1', salesmanId: 'S1', regionId: 'r', supervisorId: null, areaId: null }, grade: 'b', coverage: 'under_covered' }),
  cust('c', { ownership: { routeId: 'R2', salesmanId: 'S2', regionId: 'r', supervisorId: null, areaId: null }, grade: 'c', coverage: 'never_visited' }),
], { source: 'upload' });

describe('color-modes shared logic', () => {
  it('reports availability per mode (day false until scheduled)', () => {
    const ctx = buildColorContext(ds, currentPlanScenario(ds));
    const av = modeAvailability(ds.customers, ctx);
    expect(av).toMatchObject({ route: true, salesman: true, coverage: true, territory: true, grade: true, day: false });
  });

  it('day becomes available once a day is assigned', () => {
    const sc = reassignDay(currentPlanScenario(ds), 'a', 'sun');
    const ctx = buildColorContext(ds, sc);
    expect(modeAvailability(ds.customers, ctx).day).toBe(true);
    expect(colorOf(ds.customers[0], 'day', ctx)).toBe('#2563eb'); // sun
  });

  it('colours by route / grade / coverage', () => {
    const ctx = buildColorContext(ds, currentPlanScenario(ds));
    expect(colorOf(ds.customers[0], 'grade', ctx)).toBe('#16a34a'); // a
    expect(colorOf(ds.customers[1], 'coverage', ctx)).toBe('#d97706'); // under_covered
    expect(colorOf(ds.customers[0], 'route', ctx)).toBe(colorOf(ds.customers[1], 'route', ctx)); // same route R1
    expect(colorOf(ds.customers[0], 'route', ctx)).not.toBe(colorOf(ds.customers[2], 'route', ctx)); // R1 vs R2
  });

  it('legend lists distinct categories for the mode', () => {
    const ctx = buildColorContext(ds, currentPlanScenario(ds));
    const grades = legendFor(ds.customers, 'grade', ctx, {}, (d) => d).map((l) => l.label).sort();
    expect(grades).toEqual(['A', 'B', 'C']);
  });
});
