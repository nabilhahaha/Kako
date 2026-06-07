import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { snapshotRepDay, snapshotReps, type RepDayKpiRow } from './snapshot';
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

  describe('snapshotReps (scheduler batch)', () => {
    const cov: CoverageGateway = { async loadPlannedCustomers() { return ['A', 'B']; }, async loadVisits() { return [v('A', true), v('B')]; } };

    it('snapshots every rep in the batch and counts them', async () => {
      const saved: RepDayKpiRow[] = [];
      const snap = { async upsertRepDayKpi(row: RepDayKpiRow) { saved.push(row); } };
      const reps = [
        { companyId: 'co1', branchId: 'b1', salesmanId: 'r1' },
        { companyId: 'co1', branchId: 'b1', salesmanId: 'r2' },
      ];
      const r = await snapshotReps(cov, snap, reps, '2026-06-07');
      expect(r).toEqual({ snapshotted: 2, skipped: false });
      expect(saved.map((s) => s.salesmanId)).toEqual(['r1', 'r2']);
    });

    it('is a no-op (skipped) when KAKO_DISTRIBUTION is off', async () => {
      delete process.env.KAKO_DISTRIBUTION;
      const snap = { async upsertRepDayKpi() { throw new Error('should not be called'); } };
      const r = await snapshotReps(cov, snap, [{ companyId: 'c', branchId: 'b', salesmanId: 'r' }], '2026-06-07');
      expect(r).toEqual({ snapshotted: 0, skipped: true });
    });

    it('continues the batch when one rep fails (best-effort)', async () => {
      let calls = 0;
      const snap = { async upsertRepDayKpi() { calls++; if (calls === 1) throw new Error('boom'); } };
      const reps = [
        { companyId: 'c', branchId: 'b', salesmanId: 'r1' },
        { companyId: 'c', branchId: 'b', salesmanId: 'r2' },
      ];
      const r = await snapshotReps(cov, snap, reps, '2026-06-07');
      expect(r.snapshotted).toBe(1); // r1 failed, r2 succeeded
    });
  });
});
