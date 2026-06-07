import { describe, it, expect } from 'vitest';
import { coverageKpis, rollupCoverage } from './kpi';

const v = (customerId: string, productive = false, inPlan = true, outOfRoute = false) => ({ customerId, productive, inPlan, outOfRoute });

describe('coverage KPI engine', () => {
  it('computes coverage, adherence and strike rate for a rep-day', () => {
    // planned A,B,C,D; visited A(sale), B, E(off-route, sale)
    const k = coverageKpis(['A', 'B', 'C', 'D'], [v('A', true), v('B', false), v('E', true, false, true)]);
    expect(k.planned).toBe(4);
    expect(k.visited).toBe(3);
    expect(k.plannedVisited).toBe(2);    // A, B
    expect(k.missed).toBe(2);            // C, D
    expect(k.offRoute).toBe(1);          // E
    expect(k.productive).toBe(2);        // A, E
    expect(k.coveragePct).toBe(50);      // 2/4
    expect(k.adherencePct).toBeCloseTo(66.7, 1); // 2/3
    expect(k.strikeRatePct).toBeCloseTo(66.7, 1); // 2/3
  });

  it('is 100% coverage when every planned customer is visited', () => {
    const k = coverageKpis(['A', 'B'], [v('A', true), v('B', true)]);
    expect(k.coveragePct).toBe(100);
    expect(k.adherencePct).toBe(100);
    expect(k.strikeRatePct).toBe(100);
    expect(k.missed).toBe(0);
  });

  it('counts distinct customers (a re-visit is not double-counted)', () => {
    const k = coverageKpis(['A'], [v('A'), v('A', true)]);
    expect(k.visited).toBe(1);
    expect(k.plannedVisited).toBe(1);
  });

  it('handles an empty plan / empty day without dividing by zero', () => {
    expect(coverageKpis([], [])).toMatchObject({ coveragePct: 0, adherencePct: 0, strikeRatePct: 0, planned: 0, visited: 0 });
    expect(coverageKpis(['A', 'B'], [])).toMatchObject({ coveragePct: 0, missed: 2, visited: 0 });
  });

  it('flags off-route visits via either inPlan=false or outOfRoute=true', () => {
    const k = coverageKpis(['A'], [v('A'), v('B', false, false), v('C', false, true, true)]);
    expect(k.offRoute).toBe(2);
  });

  it('rolls up multiple rep-days into a team total', () => {
    const d1 = coverageKpis(['A', 'B'], [v('A', true), v('B')]);       // planned2 visited2 pv2 prod1
    const d2 = coverageKpis(['C', 'D', 'E'], [v('C', true)]);          // planned3 visited1 pv1 prod1
    const r = rollupCoverage([d1, d2]);
    expect(r.planned).toBe(5);
    expect(r.visited).toBe(3);
    expect(r.plannedVisited).toBe(3);
    expect(r.productive).toBe(2);
    expect(r.coveragePct).toBe(60);   // 3/5
    expect(r.strikeRatePct).toBeCloseTo(66.7, 1); // 2/3
  });
});
