import { describe, it, expect } from 'vitest';
import { getRepDayCoverage, getTeamDayCoverage } from './service';
import type { CoverageGateway } from './gateway';
import type { VisitFact } from './kpi';

function makeGateway(data: Record<string, { planned: string[]; visits: VisitFact[] }>): CoverageGateway {
  return {
    async loadPlannedCustomers(salesmanId) { return data[salesmanId]?.planned ?? []; },
    async loadVisits(salesmanId) { return data[salesmanId]?.visits ?? []; },
  };
}
const v = (customerId: string, productive = false, inPlan = true, outOfRoute = false) => ({ customerId, productive, inPlan, outOfRoute });

describe('coverage read-model service', () => {
  it('computes a rep-day coverage from planned journey + visits', async () => {
    const gw = makeGateway({ rep1: { planned: ['A', 'B', 'C'], visits: [v('A', true), v('B')] } });
    const r = await getRepDayCoverage(gw, 'rep1', '2026-06-07');
    expect(r).toMatchObject({ salesmanId: 'rep1', date: '2026-06-07', planned: 3, visited: 2, plannedVisited: 2, missed: 1, coveragePct: expect.closeTo(66.7, 1) });
  });

  it('rolls up a supervisor team', async () => {
    const gw = makeGateway({
      rep1: { planned: ['A', 'B'], visits: [v('A', true), v('B', true)] }, // coverage 100
      rep2: { planned: ['C', 'D', 'E'], visits: [v('C', true)] },           // coverage 33.3
    });
    const team = await getTeamDayCoverage(gw, ['rep1', 'rep2'], '2026-06-07');
    expect(team.perRep).toHaveLength(2);
    expect(team.total.planned).toBe(5);
    expect(team.total.plannedVisited).toBe(3);
    expect(team.total.coveragePct).toBe(60);   // 3/5
    expect(team.total.productive).toBe(3);
  });

  it('handles a rep with no plan / no visits', async () => {
    const gw = makeGateway({});
    const r = await getRepDayCoverage(gw, 'repX', '2026-06-07');
    expect(r).toMatchObject({ planned: 0, visited: 0, coveragePct: 0, strikeRatePct: 0 });
  });
});
