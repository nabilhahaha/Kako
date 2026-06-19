/**
 * Coverage-status presentation map (CJ-3) — the single source for the i18n key +
 * Badge variant of each coverage status, so every surface (Customer 360, coverage
 * list, future dashboards) renders the status identically. Pure, no I/O.
 */
import type { CoverageStatus } from './coverage-status';

type BadgeVariant = 'success' | 'warning' | 'info' | 'destructive' | 'secondary';

/** Coverage status → i18n key (under the `coverage` namespace). */
export const COVERAGE_STATUS_KEY: Record<CoverageStatus, string> = {
  on_track: 'coverage.onTrack',
  under_covered: 'coverage.underCovered',
  over_covered: 'coverage.overCovered',
  never_visited: 'coverage.neverVisited',
};

/** Coverage status → Badge variant. */
export const COVERAGE_STATUS_VARIANT: Record<CoverageStatus, BadgeVariant> = {
  on_track: 'success',
  under_covered: 'warning',
  over_covered: 'info',
  never_visited: 'destructive',
};

/** Ordered list for filters/legends (exceptions first). */
export const COVERAGE_STATUS_ORDER: CoverageStatus[] = [
  'never_visited',
  'under_covered',
  'over_covered',
  'on_track',
];
