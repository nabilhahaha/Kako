/**
 * Shared Planning Engines — the canonical, framework-agnostic planning layer.
 *
 * Planning concepts (frequency/workload, working days, day assignment, route
 * balancing, capacity/constraints + feasibility, scope, scenario edits + metrics)
 * are PLATFORM capabilities, not TIS-only. Every planning surface consumes them
 * from here so the underlying logic is shared and never duplicated:
 *
 *   · New Optimization (Excel-in/out session)
 *   · Territory Intelligence Studio
 *   · Journey Planning
 *   · Route Management
 *   · Future planning workflows
 *
 * The UI may differ per module; the engines below are the single source of truth.
 * These are all pure (no I/O) — import them here, do not re-implement planning rules.
 */

// ── Frequency & workload (FR engine) ─────────────────────────────────────────
export {
  parseFrequency,
  formatFrequency,
  frequencyToVisitsPerWeek,
  frequencyFromVisitsPerWeek,
  coerceFrequencyToken,
  type VisitFrequency,
} from '@/lib/route-optimization/visit-frequency';
export { resolveVisitFrequency } from '@/lib/route-optimization/frequency-resolver';

// ── Workload primitive (per-customer field-load source of truth) ─────────────
export { customerWorkload } from '@/lib/tis/dataset';

// ── Expected visit duration (customer → channel → class → global default) ────
export {
  DEFAULT_VISIT_DURATION_MIN,
  defaultVisitDurationConfig,
  resolveVisitDuration,
  visitMinutesPerWeek,
  type VisitDurationConfig,
  type VisitDurationInputs,
} from './visit-duration';

// ── Working days & day assignment ────────────────────────────────────────────
export { BUSINESS_DOW, workingDayList } from '@/lib/tis/optimize-routes';

// ── Route balancing · capacity/constraints · feasibility ─────────────────────
export {
  balanceRoutes,
  resolveRouteCount,
  validateConstraints,
  type RouteConstraints,
  type RoutePlan,
  type RouteSummary,
  type FeasibilityResult,
} from '@/lib/tis/optimize-routes';

// ── Scope (Region → Salesman → Route working set) ────────────────────────────
export {
  emptyScope,
  initialScope,
  isScoped,
  scopeCustomers,
  scopeCustomerIds,
  scopeOptions,
  withRegion,
  withSalesman,
  toggleRoute,
  type ScopeState,
  type ScopeOptions,
} from '@/lib/tis/scope';

// ── Scenario model · metrics · comparison ────────────────────────────────────
export {
  applyScenario,
  scenarioMetrics,
  compareScenarios,
  type Scenario,
  type ScenarioAssignment,
  type ScenarioMetrics,
} from '@/lib/tis/scenario';

// ── Scenario edit operations (planning board / journey edits) ────────────────
export {
  setAssignment,
  moveCustomer,
  reassignSalesman,
  reassignDay,
  removeAssignment,
  cloneScenario,
  currentPlanScenario,
  liveMetrics,
} from '@/lib/tis/plan-edit';
