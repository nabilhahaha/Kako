/**
 * Territory Intelligence Studio — scenario state + metrics (TIS-0-3). Pure, no I/O.
 *
 * One scenario model threads Audit → Sizing → Optimization → Planning and is
 * compared on the SAME metrics. A scenario is a set of per-customer overrides
 * (route / salesman / visit-day) layered on a base TisDataset; metrics reuse the
 * existing engines — FR workload, Coverage rollup (CV-1), and the route optimizer
 * (distance). "Current Plan · Scenario A · B · C" are just instances.
 */
import { optimizeRoute, type OptimizeCustomer } from '@/lib/route-optimization/optimize';
import { rollupCoverage } from '@/lib/distribution/coverage-engine';
import type { CoverageStatus } from '@/lib/distribution/coverage-engine';
import { customerWorkload, type TisCustomer, type TisDataset } from './dataset';
import { balancePct } from './balance';

export interface ScenarioAssignment {
  customerId: string;
  routeId?: string | null;
  salesmanId?: string | null;
  /** Visit-day override (planning); carried for compare, not a dataset field. */
  dayOfWeek?: string | null;
}

export interface Scenario {
  id: string;
  name: string;
  assignments: ScenarioAssignment[];
}

export interface ScenarioMetrics {
  customers: number;
  /** Total weekly visit workload (Σ visits/week). */
  visits: number;
  salesValue: number;
  /** Optimized total route distance (metres) over geo-located customers. */
  distanceM: number;
  /** Coverage % from the Coverage rollup over present statuses. */
  coveragePct: number;
  routeCount: number;
  /** Workload balance across routes (100 = perfectly even). */
  routeBalancePct: number;
  /** Sales-value balance across routes (100 = perfectly even). */
  valueBalancePct: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Apply a scenario's overrides onto the base dataset, returning a NEW dataset.
 *  Only route/salesman ownership is materialized (day-of-week is a planning
 *  attribute, not a dataset field). Pure. */
export function applyScenario(dataset: TisDataset, scenario: Scenario): TisDataset {
  const byId = new Map(scenario.assignments.map((a) => [a.customerId, a]));
  return {
    ...dataset,
    customers: dataset.customers.map((c) => {
      const a = byId.get(c.id);
      if (!a) return c;
      return {
        ...c,
        ownership: {
          ...c.ownership,
          routeId: a.routeId !== undefined ? a.routeId : c.ownership.routeId,
          salesmanId: a.salesmanId !== undefined ? a.salesmanId : c.ownership.salesmanId,
        },
      };
    }),
  };
}

/** Compute the comparison metrics for a dataset (already scenario-applied). Pure. */
export function scenarioMetrics(dataset: TisDataset): ScenarioMetrics {
  const customers = dataset.customers;

  let visits = 0;
  let salesValue = 0;
  const statuses: CoverageStatus[] = [];
  const byRoute = new Map<string, TisCustomer[]>();

  for (const c of customers) {
    const w = customerWorkload(c);
    if (w != null) visits += w;
    if (c.salesValue != null) salesValue += c.salesValue;
    if (c.coverage != null) statuses.push(c.coverage);
    const rk = c.ownership.routeId;
    if (rk) {
      const list = byRoute.get(rk) ?? [];
      list.push(c);
      byRoute.set(rk, list);
    }
  }

  // Distance: optimize each route over its geo-located stops, sum the totals.
  let distanceM = 0;
  for (const list of byRoute.values()) {
    const opt: OptimizeCustomer[] = list
      .filter((c) => c.geo)
      .map((c) => ({ customerId: c.id, latitude: c.geo!.lat, longitude: c.geo!.lng }));
    if (opt.length > 1) distanceM += optimizeRoute(opt, null).totalDistanceM;
  }

  // Route balance: coefficient of variation of per-route workload / value (100 = even).
  const routeLists = [...byRoute.values()];
  const routeWorkloads = routeLists.map((list) => list.reduce((s, c) => s + (customerWorkload(c) ?? 0), 0));
  const routeValues = routeLists.map((list) => list.reduce((s, c) => s + (c.salesValue ?? 0), 0));
  const routeBalancePct = balancePct(routeWorkloads);
  const valueBalancePct = balancePct(routeValues);

  const cov = rollupCoverage(statuses);

  return {
    customers: customers.length,
    visits: round1(visits),
    salesValue: round1(salesValue),
    distanceM: Math.round(distanceM),
    coveragePct: cov.coveragePct,
    routeCount: byRoute.size,
    routeBalancePct,
    valueBalancePct,
  };
}

export interface ScenarioComparison {
  id: string;
  name: string;
  metrics: ScenarioMetrics;
}

/**
 * Compare the base ("Current Plan") against a set of scenarios on identical
 * metrics — the data behind the Visual Planning compare view. Pure.
 */
export function compareScenarios(
  base: TisDataset,
  scenarios: readonly Scenario[],
  currentLabel = 'Current Plan',
): ScenarioComparison[] {
  return [
    { id: 'current', name: currentLabel, metrics: scenarioMetrics(base) },
    ...scenarios.map((s) => ({ id: s.id, name: s.name, metrics: scenarioMetrics(applyScenario(base, s)) })),
  ];
}
