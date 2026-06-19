/**
 * Route Optimization — multi-objective route balancer (RO-1). Pure, no I/O.
 * Assigns a customer set into K routes balanced by WORKLOAD (not customer count),
 * geographically seeded for compactness, under user-set constraints. Emits a TIS-0
 * `ScenarioAssignment[]` so the result flows straight into scenarioMetrics /
 * compareScenarios / the Geo map / drag-and-drop planning. Deterministic.
 *
 * Algorithm: resolve K (no hardcoded counts) → farthest-point geo seeds →
 * nearest-seed clusters → greedy workload rebalance under max-per-route. Customers
 * without geo are round-robined to the lightest route.
 */
import { customerWorkload, type TisCustomer } from './dataset';
import { balancePct } from './balance';
import type { ScenarioAssignment } from './scenario';

export interface RouteConstraints {
  /** Fixed number of routes; when absent it is derived (see resolveRouteCount). */
  routeCount?: number;
  /** Soft target customers per route → K = ceil(N / target) when routeCount absent. */
  targetPerRoute?: number;
  /** Hard cap on customers per route. */
  maxPerRoute?: number;
  /** Capacity for auto route count from workload. */
  maxVisitsPerDay?: number;
  workingDays?: number;
  /** Dimension to balance across routes. Default 'workload' (visits/week). */
  balanceBy?: 'workload' | 'value' | 'count';
}

export interface RouteSummary {
  routeId: string;
  customerIds: string[];
  customers: number;
  workload: number;
  salesValue: number;
}

export interface RoutePlan {
  routeCount: number;
  assignments: ScenarioAssignment[];
  routes: RouteSummary[];
  /** Workload balance across routes (100 = even). */
  workloadBalancePct: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const ROUTE_ID = (i: number) => `opt-route-${i + 1}`;

/** Haversine distance (km). Pure. */
function distKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Resolve K from the most specific constraint provided; never a hardcoded count. */
export function resolveRouteCount(customers: readonly TisCustomer[], c: RouteConstraints): number {
  const n = customers.length;
  if (n === 0) return 0;
  if (c.routeCount && c.routeCount > 0) return Math.min(c.routeCount, n);
  if (c.targetPerRoute && c.targetPerRoute > 0) return Math.max(1, Math.ceil(n / c.targetPerRoute));
  if (c.maxVisitsPerDay && c.maxVisitsPerDay > 0) {
    const days = c.workingDays && c.workingDays > 0 ? c.workingDays : 5;
    const totalWorkload = customers.reduce((s, x) => s + (customerWorkload(x) ?? 0), 0);
    const perRoute = c.maxVisitsPerDay * days;
    if (perRoute > 0 && totalWorkload > 0) return Math.max(1, Math.ceil(totalWorkload / perRoute));
  }
  if (c.maxPerRoute && c.maxPerRoute > 0) return Math.max(1, Math.ceil(n / c.maxPerRoute));
  return 1;
}

/** Farthest-point sampling of K seeds among geo-located customers. Deterministic. */
function pickSeeds(geoCustomers: TisCustomer[], k: number): TisCustomer[] {
  if (geoCustomers.length <= k) return [...geoCustomers];
  const seeds: TisCustomer[] = [geoCustomers[0]];
  while (seeds.length < k) {
    let best: TisCustomer | null = null, bestD = -1;
    for (const c of geoCustomers) {
      const d = Math.min(...seeds.map((s) => distKm(c.geo!, s.geo!)));
      if (d > bestD) { bestD = d; best = c; }
    }
    if (!best) break;
    seeds.push(best);
  }
  return seeds;
}

/** Balance a customer set into K workload-even, geographically compact routes. Pure. */
export function balanceRoutes(customers: readonly TisCustomer[], constraints: RouteConstraints = {}): RoutePlan {
  const k = resolveRouteCount(customers, constraints);
  if (k === 0) return { routeCount: 0, assignments: [], routes: [], workloadBalancePct: 100 };

  // Balance dimension: workload (default), sales value, or plain count.
  const wl = (c: TisCustomer) =>
    constraints.balanceBy === 'value' ? (c.salesValue ?? 0)
    : constraints.balanceBy === 'count' ? 1
    : (customerWorkload(c) ?? 1); // un-cadenced ⇒ count as 1 visit/wk
  const maxPer = constraints.maxPerRoute && constraints.maxPerRoute > 0 ? constraints.maxPerRoute : Infinity;

  const buckets: TisCustomer[][] = Array.from({ length: k }, () => []);
  const loads = new Array(k).fill(0);
  const lightest = () => { let m = 0; for (let i = 1; i < k; i++) if (buckets[i].length < maxPer && loads[i] < loads[m]) m = i; return m; };

  const geoCustomers = customers.filter((c) => c.geo);
  const seeds = pickSeeds(geoCustomers, k);

  // Geo customers → nearest seed (respecting the cap; else lightest open route).
  for (const c of geoCustomers) {
    let bi = -1, bd = Infinity;
    for (let i = 0; i < seeds.length; i++) {
      if (buckets[i].length >= maxPer) continue;
      const d = distKm(c.geo!, seeds[i].geo!);
      if (d < bd) { bd = d; bi = i; }
    }
    if (bi < 0) bi = lightest();
    buckets[bi].push(c); loads[bi] += wl(c);
  }
  // Geo-less customers → lightest open route (round-robin by load).
  for (const c of customers.filter((x) => !x.geo)) {
    const i = lightest();
    buckets[i].push(c); loads[i] += wl(c);
  }

  // Greedy workload rebalance: move a boundary customer from the heaviest to the
  // lightest route while it reduces the spread and respects the cap.
  for (let pass = 0; pass < customers.length; pass++) {
    let hi = 0, lo = 0;
    for (let i = 1; i < k; i++) { if (loads[i] > loads[hi]) hi = i; if (loads[i] < loads[lo]) lo = i; }
    if (hi === lo || buckets[lo].length >= maxPer || buckets[hi].length <= 1) break;
    // pick the lightest-workload customer on the heavy route to move (least disruption).
    let mi = 0; for (let j = 1; j < buckets[hi].length; j++) if (wl(buckets[hi][j]) < wl(buckets[hi][mi])) mi = j;
    const mover = buckets[hi][mi];
    if (loads[hi] - wl(mover) < loads[lo] + wl(mover)) break; // would overshoot → stop
    buckets[hi].splice(mi, 1); loads[hi] -= wl(mover);
    buckets[lo].push(mover); loads[lo] += wl(mover);
  }

  const routes: RouteSummary[] = buckets.map((list, i) => ({
    routeId: ROUTE_ID(i),
    customerIds: list.map((c) => c.id),
    customers: list.length,
    workload: round1(list.reduce((s, c) => s + wl(c), 0)),
    salesValue: round1(list.reduce((s, c) => s + (c.salesValue ?? 0), 0)),
  }));
  const assignments: ScenarioAssignment[] = buckets.flatMap((list, i) => list.map((c) => ({ customerId: c.id, routeId: ROUTE_ID(i) })));

  return { routeCount: k, assignments, routes, workloadBalancePct: balancePct(loads) };
}
