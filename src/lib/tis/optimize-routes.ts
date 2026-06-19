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
import { customerWorkload, isValidGeo, type TisCustomer } from './dataset';
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
  /** Allow a single route to span multiple geographic territories. Default FALSE —
   *  geography is a HARD constraint: routes are built within one territory/city. */
  crossTerritory?: boolean;
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

/** Business-day order (Sun–Thu work week first, then Sat, then Fri last). The
 *  calendar surface renders the canonical Sun→Sat order; this only controls which
 *  N days the optimizer fills. */
export const BUSINESS_DOW = ['sun', 'mon', 'tue', 'wed', 'thu', 'sat', 'fri'] as const;

/** The first N business days (1–7) the optimizer distributes visits across. */
export function workingDayList(n: number): string[] {
  return BUSINESS_DOW.slice(0, Math.min(7, Math.max(1, Math.round(n) || 5)));
}

/** Haversine distance (km). Pure. */
function distKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export interface FeasibilityResult {
  /** Is the requested route count enough to satisfy the caps? (true when no count/caps). */
  feasible: boolean;
  /** Routes the user requested (null = auto). */
  requestedRoutes: number | null;
  /** Minimum routes needed to satisfy the caps. */
  recommendedRoutes: number;
  /** Which cap binds the recommendation. */
  bind: 'customers' | 'visits' | null;
}

/**
 * Validate optimization constraints and, when infeasible, recommend the route count
 * that WOULD fit — surfaced inline in Simple Mode so a supervisor never has to open
 * Advanced to learn a plan won't fit. Pure.
 */
export function validateConstraints(customers: readonly TisCustomer[], c: RouteConstraints): FeasibilityResult {
  const n = customers.length;
  const requested = c.routeCount && c.routeCount > 0 ? c.routeCount : null;
  let recCustomers = 1, recVisits = 1;
  if (c.maxPerRoute && c.maxPerRoute > 0) recCustomers = Math.max(1, Math.ceil(n / c.maxPerRoute));
  if (c.maxVisitsPerDay && c.maxVisitsPerDay > 0) {
    const days = c.workingDays && c.workingDays > 0 ? c.workingDays : 5;
    const totalWl = customers.reduce((s, x) => s + (customerWorkload(x) ?? 1), 0);
    const perRoute = c.maxVisitsPerDay * days;
    if (perRoute > 0) recVisits = Math.max(1, Math.ceil(totalWl / perRoute));
  }
  const hasCaps = !!((c.maxPerRoute && c.maxPerRoute > 0) || (c.maxVisitsPerDay && c.maxVisitsPerDay > 0));
  const recommendedRoutes = Math.max(1, recCustomers, recVisits);
  const bind = !hasCaps ? null : recCustomers >= recVisits ? 'customers' : 'visits';
  const feasible = requested == null ? true : requested >= recommendedRoutes;
  return { feasible, requestedRoutes: requested, recommendedRoutes, bind };
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

/** Grid + union-find geo clustering → a territory key per geo-located customer.
 *  Customers in contiguous ~CELL_DEG cells form ONE territory; distant cities (e.g.
 *  Jeddah / Riyadh / Dammam, hundreds of km apart) land in non-adjacent cells and
 *  NEVER merge. This is the hard geographic partition the optimizer balances within. */
const CELL_DEG = 0.4; // ~44 km; adjacent-cell merge ⇒ ~88 km join distance
export function clusterTerritories(customers: readonly TisCustomer[], cellDeg = CELL_DEG): Map<string, string> {
  const geo = customers.filter((c) => isValidGeo(c.geo));
  const cellOf = (c: TisCustomer) => `${Math.floor(c.geo!.lat / cellDeg)}:${Math.floor(c.geo!.lng / cellDeg)}`;
  const cells = new Set(geo.map(cellOf));
  const parent = new Map<string, string>([...cells].map((c) => [c, c]));
  const find = (x: string): string => { let r = x; while (parent.get(r) !== r) r = parent.get(r)!; while (parent.get(x) !== r) { const nx = parent.get(x)!; parent.set(x, r); x = nx; } return r; };
  const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  for (const cell of cells) {
    const [r, c] = cell.split(':').map(Number);
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const n = `${r + dr}:${c + dc}`;
      if (cells.has(n)) union(cell, n);
    }
  }
  const m = new Map<string, string>();
  for (const c of geo) m.set(c.id, find(cellOf(c)));
  return m;
}

/** Number of distinct geographic territories in a customer set. */
export function territoryCount(customers: readonly TisCustomer[]): number {
  return new Set(clusterTerritories(customers).values()).size;
}

/** Core balancer for ONE territory: K workload-even, compact routes. Pure. */
function balanceWithin(customers: readonly TisCustomer[], k: number, constraints: RouteConstraints, idOffset: number): { routes: RouteSummary[]; assignments: ScenarioAssignment[]; loads: number[] } {
  const wl = (c: TisCustomer) =>
    constraints.balanceBy === 'value' ? (c.salesValue ?? 0)
    : constraints.balanceBy === 'count' ? 1
    : (customerWorkload(c) ?? 1);
  const maxPer = constraints.maxPerRoute && constraints.maxPerRoute > 0 ? constraints.maxPerRoute : Infinity;

  const buckets: TisCustomer[][] = Array.from({ length: k }, () => []);
  const loads = new Array(k).fill(0);
  const lightest = () => { let m = 0; for (let i = 1; i < k; i++) if (buckets[i].length < maxPer && loads[i] < loads[m]) m = i; return m; };

  const geoCustomers = customers.filter((c) => c.geo);
  const seeds = pickSeeds(geoCustomers, k);
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
  for (const c of customers.filter((x) => !x.geo)) {
    const i = lightest();
    buckets[i].push(c); loads[i] += wl(c);
  }

  // Greedy workload rebalance — SAFE here because every customer is already in the
  // same territory, so moving one between routes never mixes distant cities.
  for (let pass = 0; pass < customers.length; pass++) {
    let hi = 0, lo = 0;
    for (let i = 1; i < k; i++) { if (loads[i] > loads[hi]) hi = i; if (loads[i] < loads[lo]) lo = i; }
    if (hi === lo || buckets[lo].length >= maxPer || buckets[hi].length <= 1) break;
    let mi = 0; for (let j = 1; j < buckets[hi].length; j++) if (wl(buckets[hi][j]) < wl(buckets[hi][mi])) mi = j;
    const mover = buckets[hi][mi];
    if (loads[hi] - wl(mover) < loads[lo] + wl(mover)) break;
    buckets[hi].splice(mi, 1); loads[hi] -= wl(mover);
    buckets[lo].push(mover); loads[lo] += wl(mover);
  }

  const routes: RouteSummary[] = buckets.map((list, i) => ({
    routeId: ROUTE_ID(idOffset + i),
    customerIds: list.map((c) => c.id),
    customers: list.length,
    workload: round1(list.reduce((s, c) => s + wl(c), 0)),
    salesValue: round1(list.reduce((s, c) => s + (c.salesValue ?? 0), 0)),
  }));
  const dayList = workingDayList(constraints.workingDays ?? 5);
  const assignments: ScenarioAssignment[] = buckets.flatMap((list, i) => {
    const dayLoads = new Array(dayList.length).fill(0);
    const dayOf = new Map<string, string>();
    for (const c of [...list].sort((a, b) => wl(b) - wl(a))) {
      let d = 0;
      for (let j = 1; j < dayList.length; j++) if (dayLoads[j] < dayLoads[d]) d = j;
      dayLoads[d] += wl(c);
      dayOf.set(c.id, dayList[d]);
    }
    return list.map((c) => ({ customerId: c.id, routeId: ROUTE_ID(idOffset + i), dayOfWeek: dayOf.get(c.id)! }));
  });

  return { routes, assignments, loads };
}

/**
 * Balance a customer set into workload-even, geographically COMPACT routes — with
 * geography as a HARD constraint. The set is first partitioned into territories
 * (clusterTerritories); each territory is balanced independently, so a route never
 * mixes distant cities. K is allocated across territories ∝ workload (≥1 each).
 * `crossTerritory: true` opts out (legacy single-pass). Pure.
 */
export function balanceRoutes(customers: readonly TisCustomer[], constraints: RouteConstraints = {}): RoutePlan {
  const totalK = resolveRouteCount(customers, constraints);
  if (totalK === 0) return { routeCount: 0, assignments: [], routes: [], workloadBalancePct: 100 };

  const wlOf = (c: TisCustomer) =>
    constraints.balanceBy === 'value' ? (c.salesValue ?? 0)
    : constraints.balanceBy === 'count' ? 1
    : (customerWorkload(c) ?? 1);

  // Partition by territory (unless explicitly disabled or there is no geo at all).
  const terr = constraints.crossTerritory ? new Map<string, string>() : clusterTerritories(customers);
  const groups = new Map<string, TisCustomer[]>();
  for (const c of customers) if (isValidGeo(c.geo) && terr.has(c.id)) {
    const key = terr.get(c.id)!;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(c);
  }

  if (constraints.crossTerritory || groups.size <= 1) {
    const r = balanceWithin(customers, Math.min(totalK, Math.max(1, customers.length)), constraints, 0);
    return { routeCount: r.routes.length, assignments: r.assignments, routes: r.routes, workloadBalancePct: balancePct(r.loads) };
  }

  // Geo-less customers attach to the largest territory (they carry no location, so
  // they cannot violate geography).
  const largest = [...groups.entries()].sort((a, b) => b[1].length - a[1].length)[0][0];
  for (const c of customers) if (!isValidGeo(c.geo)) groups.get(largest)!.push(c);

  // Allocate K across territories ∝ workload (≥1 each); geography wins over the exact K.
  const parts = [...groups.values()];
  const partWl = parts.map((p) => p.reduce((s, c) => s + wlOf(c), 0));
  const totalWl = partWl.reduce((a, b) => a + b, 0) || 1;

  let offset = 0;
  const allRoutes: RouteSummary[] = [], allAssign: ScenarioAssignment[] = [];
  let allLoads: number[] = [];
  parts.forEach((p, idx) => {
    const kp = Math.max(1, Math.min(Math.round(totalK * partWl[idx] / totalWl) || 1, p.length));
    const r = balanceWithin(p, kp, constraints, offset);
    offset += r.routes.length;
    allRoutes.push(...r.routes); allAssign.push(...r.assignments); allLoads = allLoads.concat(r.loads);
  });

  return { routeCount: allRoutes.length, assignments: allAssign, routes: allRoutes, workloadBalancePct: balancePct(allLoads) };
}

/** Per-route geographic report line. */
export interface RouteGeoStat {
  routeId: string;
  customers: number;
  /** Distinct cities/territories on this route (1 = clean). */
  cities: number;
  /** Max distance from the route centroid (km) — the route radius. */
  radiusKm: number;
  /** Outlier customer ids (> 2× the route's mean centroid distance, beyond 25 km). */
  outliers: string[];
  valid: boolean;
}
export interface PlanGeoValidation {
  /** No route mixes territories and none exceeds the span limit. */
  valid: boolean;
  /** Distinct territories across the customer set. */
  territories: number;
  /** Largest single-route radius (km). */
  maxRouteRadiusKm: number;
  /** Count of invalid (mixed-city / oversized) routes. */
  invalidCount: number;
  /** Per-route report: customers · cities · radius · outliers. */
  routes: RouteGeoStat[];
}

/**
 * Geographic quality + validation report for a plan: per route → customers, cities,
 * radius, outliers; a route is INVALID if it mixes territories or its radius exceeds
 * `maxKm`. Used to BLOCK export/validity when geography fails. Pure.
 */
export function validatePlanGeography(customers: readonly TisCustomer[], assignments: readonly ScenarioAssignment[], opts: { maxKm?: number } = {}): PlanGeoValidation {
  const maxKm = opts.maxKm ?? 150;
  const terr = clusterTerritories(customers);
  const byId = new Map(customers.map((c) => [c.id, c]));
  const routeCust = new Map<string, TisCustomer[]>();
  for (const a of assignments) if (a.routeId) {
    const c = byId.get(a.customerId);
    if (c) (routeCust.get(a.routeId) ?? routeCust.set(a.routeId, []).get(a.routeId)!).push(c);
  }
  let maxRadius = 0;
  const routes: RouteGeoStat[] = [];
  for (const [rid, list] of routeCust) {
    const geo = list.filter((c) => isValidGeo(c.geo));
    const cities = new Set(geo.map((c) => terr.get(c.id)).filter((x): x is string => !!x)).size;
    let radius = 0; const outliers: string[] = [];
    if (geo.length > 0) {
      const cLat = geo.reduce((s, c) => s + c.geo!.lat, 0) / geo.length;
      const cLng = geo.reduce((s, c) => s + c.geo!.lng, 0) / geo.length;
      const dists = geo.map((c) => ({ id: c.id, d: distKm({ lat: cLat, lng: cLng }, c.geo!) }));
      radius = Math.max(0, ...dists.map((x) => x.d));
      const mean = dists.reduce((s, x) => s + x.d, 0) / dists.length;
      for (const x of dists) if (x.d > 25 && x.d > 2 * mean) outliers.push(x.id);
    }
    maxRadius = Math.max(maxRadius, radius);
    const valid = cities <= 1 && radius <= maxKm;
    routes.push({ routeId: rid, customers: list.length, cities, radiusKm: round1(radius), outliers, valid });
  }
  const invalidCount = routes.filter((r) => !r.valid).length;
  return { valid: invalidCount === 0, territories: new Set(terr.values()).size, maxRouteRadiusKm: round1(maxRadius), invalidCount, routes };
}
