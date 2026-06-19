/**
 * Coverage Engine — public façade (CV-1). The single import surface for coverage
 * across the platform (Customer 360, coverage dashboard/list, Journey Planning,
 * and future Geo Intelligence / Territory Audit / Sales Force Sizing / TIS).
 *
 * Client-safe: this barrel re-exports only the pure read-model + presentation.
 * Server loaders (DB I/O) live in `./server` (import directly from server code).
 */

// Strategic customer coverage status (CJ-3) — the per-customer read-model.
export {
  coverageStatus,
  computeCoverage,
  expectedVisitsInWindow,
  COVERAGE_WINDOW_DAYS,
  COVERAGE_UNDER,
  COVERAGE_OVER,
  type CoverageStatus,
  type CustomerCoverage,
} from '@/lib/distribution/journey-plan/coverage-status';

// Presentation map (status → i18n key + badge variant + ordering).
export {
  COVERAGE_STATUS_KEY,
  COVERAGE_STATUS_VARIANT,
  COVERAGE_STATUS_ORDER,
} from '@/lib/distribution/journey-plan/coverage-status-ui';

// Rollup read-model (CV-1).
export {
  rollupCoverage,
  groupCoverageRollup,
  type CoverageRollup,
  type CoverageGroupRollup,
  type CoverageGroupBy,
} from './rollup';
