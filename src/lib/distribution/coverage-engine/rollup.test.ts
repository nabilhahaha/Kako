import { describe, it, expect } from 'vitest';
import { rollupCoverage, groupCoverageRollup } from './rollup';
import type { CoverageStatus } from '@/lib/distribution/journey-plan/coverage-status';

describe('rollupCoverage', () => {
  it('counts each status + computes coverage% (onTrack+over ÷ total)', () => {
    const statuses: CoverageStatus[] = [
      'on_track', 'on_track', 'on_track', 'over_covered',
      'under_covered', 'never_visited',
    ];
    const r = rollupCoverage(statuses);
    expect(r).toEqual({ total: 6, onTrack: 3, underCovered: 1, overCovered: 1, neverVisited: 1, coveragePct: 66.7 });
  });
  it('empty ⇒ zeros, no divide-by-zero', () => {
    expect(rollupCoverage([])).toEqual({ total: 0, onTrack: 0, underCovered: 0, overCovered: 0, neverVisited: 0, coveragePct: 0 });
  });
  it('all on track ⇒ 100%', () => {
    expect(rollupCoverage(['on_track', 'on_track']).coveragePct).toBe(100);
  });
  it('all never-visited ⇒ 0%', () => {
    expect(rollupCoverage(['never_visited', 'under_covered']).coveragePct).toBe(0);
  });
});

describe('groupCoverageRollup', () => {
  type Row = { id: string; salesman: string | null; status: CoverageStatus };
  const rows: Row[] = [
    { id: 'a', salesman: 's1', status: 'on_track' },
    { id: 'b', salesman: 's1', status: 'never_visited' },
    { id: 'c', salesman: 's2', status: 'on_track' },
    { id: 'd', salesman: null, status: 'under_covered' },
  ];
  it('groups by key and rolls up each group', () => {
    const groups = groupCoverageRollup(rows, (r) => r.salesman, (r) => r.status);
    const byKey = new Map(groups.map((g) => [g.key, g]));
    expect(byKey.get('s1')).toMatchObject({ total: 2, onTrack: 1, neverVisited: 1, coveragePct: 50 });
    expect(byKey.get('s2')).toMatchObject({ total: 1, onTrack: 1, coveragePct: 100 });
    expect(byKey.get('')).toMatchObject({ total: 1, underCovered: 1, coveragePct: 0 }); // unassigned bucket
  });
});
