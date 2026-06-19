import { describe, it, expect } from 'vitest';
import { coverageStatus, expectedVisitsInWindow, computeCoverage } from './coverage-status';
import type { PlanCadence } from './cadence';

describe('coverageStatus', () => {
  it('never visited when actual = 0', () => {
    expect(coverageStatus(4, 0)).toBe('never_visited');
    expect(coverageStatus(0, 0)).toBe('never_visited');
  });
  it('over-covered when visited but unplanned (expected 0)', () => {
    expect(coverageStatus(0, 2)).toBe('over_covered');
  });
  it('bands: under / on-track / over', () => {
    expect(coverageStatus(4, 2)).toBe('under_covered'); // 0.5
    expect(coverageStatus(4, 4)).toBe('on_track');       // 1.0
    expect(coverageStatus(4, 3)).toBe('on_track');       // 0.75 (boundary, inclusive)
    expect(coverageStatus(4, 6)).toBe('over_covered');   // 1.5
  });
});

describe('expectedVisitsInWindow', () => {
  // 4-week window starting Sunday 2026-06-07 .. 2026-07-04.
  const from = '2026-06-07';
  const to = '2026-07-04';
  it('weekly Sunday plan → 4 expected days', () => {
    const plans: PlanCadence[] = [{ dayOfWeek: 'sun', frequency: 'weekly', effectiveFrom: '2026-06-07' }];
    expect(expectedVisitsInWindow(plans, from, to)).toBe(4);
  });
  it('biweekly Sunday plan → 2 expected days', () => {
    const plans: PlanCadence[] = [{ dayOfWeek: 'sun', frequency: 'biweekly', effectiveFrom: '2026-06-07' }];
    expect(expectedVisitsInWindow(plans, from, to)).toBe(2);
  });
  it('no plans → 0', () => {
    expect(expectedVisitsInWindow([], from, to)).toBe(0);
  });
});

describe('computeCoverage', () => {
  const from = '2026-06-07';
  const to = '2026-07-04';
  const weekly: PlanCadence[] = [{ dayOfWeek: 'sun', frequency: 'weekly', effectiveFrom: '2026-06-07' }];
  it('on track when actual ≈ expected', () => {
    expect(computeCoverage(weekly, ['2026-06-07', '2026-06-14', '2026-06-21', '2026-06-28'], from, to).status).toBe('on_track');
  });
  it('under-covered when visits are sparse', () => {
    expect(computeCoverage(weekly, ['2026-06-07'], from, to).status).toBe('under_covered');
  });
  it('never visited when no actuals', () => {
    expect(computeCoverage(weekly, [], from, to).status).toBe('never_visited');
  });
  it('ignores visits outside the window', () => {
    const cov = computeCoverage(weekly, ['2026-05-01', '2026-06-07'], from, to);
    expect(cov.actual).toBe(1);
  });
});
