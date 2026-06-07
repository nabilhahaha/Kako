import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { snapshotRepDay, type RepDayKpiRow } from './snapshot';
import type { CoverageGateway } from './gateway';
import type { VisitFact } from './kpi';

const v = (customerId: string, productive = false, inPlan = true) => ({ customerId, productive, inPlan, outOfRoute: false });

function makeCoverageGw(planned: string[], visits: VisitFact[]): CoverageGateway {
  return { async loadPlannedCustomers() { return planned; }, async loadVisits() { return visits; } };
}

describe('rep-day KPI snapshot service', () => {
  beforeEach(() => { process.env.KAKO_DISTRIBUTION = '1'; });
  afterEach(() => { delete process.env.KAKO_DISTRIBUTION; });

  const input = { companyId: 'co1', branchId: 'b1', salesmanId: 'rep1', date: '2026-06-07' };

  it('no-op when KAKO_DISTRIBUTION off', async () => {
    delete process.env.KAKO_DISTRIBUTION;
    let saved: RepDayKpiRow | null = null;
    const r = await snapshotRepDay(makeCoverageGw(['A'], [v('A')]), { async upsertRepDayKpi(row) { saved = row; } }, input);
    expect(r).toEqual({ snapshotted: false, reason: 'disabled' });
    expect(saved).toBeNull();
  });

  it('computes coverage and upserts a snapshot row with scope keys', async () => {
    let saved: RepDayKpiRow | null = null;
    const r = await snapshotRepDay(
      makeCoverageGw(['A', 'B', 'C'], [v('A', true), v('B')]),
      { async upsertRepDayKpi(row) { saved = row; } },
      input,
    );
    expect(r.snapshotted).toBe(true);
    expect(saved).toMatchObject({
      companyId: 'co1', branchId: 'b1', salesmanId: 'rep1', kpiDate: '2026-06-07',
      planned: 3, visited: 2, plannedVisited: 2, missed: 1, productive: 1,
    });
    expect(saved!.coveragePct).toBeCloseTo(66.7, 1);
    // the persisted row carries no salesmanId/date duplication issues
    expect(saved).not.toHaveProperty('salesmanId', undefined);
  });
});
