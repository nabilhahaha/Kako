/**
 * Customer coverage status (CJ-3) — pure, no I/O. A read-model derived from the
 * customer's PLANNED visit cadence (CJ-2 `isVisitDueOn`) vs ACTUAL visits over a
 * rolling window. One source of truth, consumable everywhere (Customer 360,
 * coverage list, dashboards, Smart-Next, Geo, Customer Health).
 */
import { isVisitDueOn, type PlanCadence } from './cadence';

export type CoverageStatus = 'on_track' | 'under_covered' | 'over_covered' | 'never_visited';

/** Rolling window (days) used to assess coverage. */
export const COVERAGE_WINDOW_DAYS = 28;
/** Actual/expected ratio bands. Below UNDER → under-covered; above OVER → over. */
export const COVERAGE_UNDER = 0.75;
export const COVERAGE_OVER = 1.25;

export interface CustomerCoverage {
  status: CoverageStatus;
  expected: number; // planned visit-days in the window
  actual: number;   // distinct visited days in the window
}

/** Classify coverage from expected vs actual visit counts. Pure. */
export function coverageStatus(expected: number, actual: number): CoverageStatus {
  if (actual <= 0) return 'never_visited';
  if (expected <= 0) return 'over_covered'; // visited but unplanned
  const ratio = actual / expected;
  if (ratio < COVERAGE_UNDER) return 'under_covered';
  if (ratio > COVERAGE_OVER) return 'over_covered';
  return 'on_track';
}

/** Expected visit-DAYS in [fromISO, toISO] inclusive: a day counts once if ANY of
 *  the customer's plan rows is due that day (CJ-2 cadence). Pure. */
export function expectedVisitsInWindow(plans: readonly PlanCadence[], fromISO: string, toISO: string): number {
  if (plans.length === 0) return 0;
  const from = new Date(`${fromISO}T00:00:00Z`);
  const to = new Date(`${toISO}T00:00:00Z`);
  let n = 0;
  for (let d = new Date(from); d <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.toISOString().slice(0, 10);
    if (plans.some((p) => isVisitDueOn(p, day))) n++;
  }
  return n;
}

/** Compose the full coverage read-model for one customer. Pure. */
export function computeCoverage(
  plans: readonly PlanCadence[],
  visitDates: readonly string[],
  fromISO: string,
  toISO: string,
): CustomerCoverage {
  const expected = expectedVisitsInWindow(plans, fromISO, toISO);
  const actual = new Set(visitDates.filter((d) => d >= fromISO && d <= toISO)).size;
  return { status: coverageStatus(expected, actual), expected, actual };
}
