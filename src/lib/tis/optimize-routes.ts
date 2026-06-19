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
  /** Routes the user requested (P1-A). */
  requestedRoutes?: number;
  /** Small/singleton territories merged into a nearby one (P1-A). */
  absorbedTerritories?: number;
  /** When geography needs MORE routes than requested (distinct far territories > K),
   *  the minimum feasible route count to keep cities un-mixed — null otherwise. */
  geographyRequiresRoutes?: number | null;
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

/** Hilbert curve index (locality-preserving, no quadrant jumps). side = 2^bits. */
function hilbertD(side: number, x: number, y: number): number {
  let d = 0;
  for (let s = side >> 1; s > 0; s >>= 1) {
    const rx = (x & s) > 0 ? 1 : 0;
    const ry = (y & s) > 0 ? 1 : 0;
    d += s * s * ((3 * rx) ^ ry);
    if (ry === 0) { if (rx === 1) { x = s - 1 - x; y = s - 1 - y; } const t = x; x = y; y = t; }
  }
  return d;
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

/** Mean geo centroid of a customer list (null when none located). Pure. */
function centroidOf(list: readonly TisCustomer[]): { lat: number; lng: number } | null {
  const geo = list.filter((c) => isValidGeo(c.geo));
  if (geo.length === 0) return null;
  return { lat: geo.reduce((s, c) => s + c.geo!.lat, 0) / geo.length, lng: geo.reduce((s, c) => s + c.geo!.lng, 0) / geo.length };
}

/** Core balancer for ONE territory: K workload-even, geographically COMPACT routes via a
 *  Hilbert space-filling curve — customers are ordered along the locality-preserving
 *  curve and cut into K contiguous, workload-balanced segments (P1-B). Each segment is a
 *  compact sub-area (no north/south mixing), with no outlier-seed fragmentation. Pure. */
function balanceWithin(customers: readonly TisCustomer[], k: number, constraints: RouteConstraints, idOffset: number): { routes: RouteSummary[]; assignments: ScenarioAssignment[]; loads: number[] } {
  const wl = (c: TisCustomer) =>
    constraints.balanceBy === 'value' ? (c.salesValue ?? 0)
    : constraints.balanceBy === 'count' ? 1
    : (customerWorkload(c) ?? 1);
  const maxPer = constraints.maxPerRoute && constraints.maxPerRoute > 0 ? constraints.maxPerRoute : Infinity;

  const geo = customers.filter((c) => isValidGeo(c.geo));
  const noGeo = customers.filter((c) => !isValidGeo(c.geo));
  let buckets: TisCustomer[][] = [];

  if (geo.length === 0) {
    // No geography: round-robin into ≤k buckets by workload.
    const kk = Math.min(k, Math.max(1, customers.length));
    buckets = Array.from({ length: kk }, () => []);
    const loads0 = new Array(kk).fill(0);
    for (const c of customers) { let m = 0; for (let i = 1; i < kk; i++) if (loads0[i] < loads0[m]) m = i; buckets[m].push(c); loads0[m] += wl(c); }
  } else {
    // Hilbert order over the territory bounding box.
    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    for (const c of geo) { minLat = Math.min(minLat, c.geo!.lat); maxLat = Math.max(maxLat, c.geo!.lat); minLng = Math.min(minLng, c.geo!.lng); maxLng = Math.max(maxLng, c.geo!.lng); }
    const spanLat = Math.max(1e-9, maxLat - minLat), spanLng = Math.max(1e-9, maxLng - minLng);
    const SIDE = 1 << 16;
    const code = (c: TisCustomer) => {
      const x = Math.min(SIDE - 1, Math.max(0, Math.round((c.geo!.lng - minLng) / spanLng * (SIDE - 1))));
      const y = Math.min(SIDE - 1, Math.max(0, Math.round((c.geo!.lat - minLat) / spanLat * (SIDE - 1))));
      return hilbertD(SIDE, x, y);
    };
    const ordered = geo.map((c) => ({ c, h: code(c) })).sort((a, b) => a.h - b.h).map((o) => o.c);
    const totalWl = ordered.reduce((s, c) => s + wl(c), 0) || 1;
    const kk = Math.min(k, ordered.length);
    const target = totalWl / kk;
    let cur: TisCustomer[] = [], curWl = 0;
    for (const c of ordered) {
      cur.push(c); curWl += wl(c);
      // Cut into a new segment once the workload target (or the per-route cap) is hit,
      // keeping at least one segment for the remainder.
      if (buckets.length < kk - 1 && (curWl >= target || cur.length >= maxPer)) { buckets.push(cur); cur = []; curWl = 0; }
    }
    if (cur.length) buckets.push(cur);
    // Geo-less customers → the lightest segment.
    const loads0 = buckets.map((b) => b.reduce((s, c) => s + wl(c), 0));
    for (const c of noGeo) { let m = 0; for (let i = 1; i < buckets.length; i++) if (loads0[i] < loads0[m]) m = i; buckets[m].push(c); loads0[m] += wl(c); }
  }

  // Build routes from non-empty buckets (contiguous ids), with day assignment.
  const dayList = workingDayList(constraints.workingDays ?? 5);
  const routes: RouteSummary[] = [];
  const assignments: ScenarioAssignment[] = [];
  const outLoads: number[] = [];
  let li = 0;
  for (const list of buckets) {
    if (list.length === 0) continue;
    const rid = ROUTE_ID(idOffset + li); li++;
    const load = list.reduce((s, c) => s + wl(c), 0);
    routes.push({ routeId: rid, customerIds: list.map((c) => c.id), customers: list.length, workload: round1(load), salesValue: round1(list.reduce((s, c) => s + (c.salesValue ?? 0), 0)) });
    outLoads.push(load);
    const dayLoads = new Array(dayList.length).fill(0);
    const dayOf = new Map<string, string>();
    for (const c of [...list].sort((a, b) => wl(b) - wl(a))) {
      let d = 0;
      for (let j = 1; j < dayList.length; j++) if (dayLoads[j] < dayLoads[d]) d = j;
      dayLoads[d] += wl(c);
      dayOf.set(c.id, dayList[d]);
    }
    for (const c of list) assignments.push({ customerId: c.id, routeId: rid, dayOfWeek: dayOf.get(c.id)! });
  }

  return { routes, assignments, loads: outLoads };
}

/** P1-A/C: absorb each small/singleton territory into the NEAREST territory within
 *  ABSORB_KM, so isolated points don't each spawn a route. Truly remote small clusters
 *  (no neighbour within range) are kept (a justified route). Returns merged groups +
 *  how many territories were absorbed. Pure. */
const ABSORB_KM = 120;
function absorbTerritories(groups: Map<string, TisCustomer[]>, totalCustomers: number): { merged: Map<string, TisCustomer[]>; absorbed: number } {
  const mergeBelow = Math.max(3, Math.round(totalCustomers * 0.005));
  const map = new Map<string, TisCustomer[]>([...groups.entries()].map(([k, v]) => [k, [...v]]));
  const kept = new Set<string>(); // genuinely remote small territories (justified routes)
  let absorbed = 0;
  for (let guard = 0; guard < groups.size + 1; guard++) {
    const small = [...map.entries()].filter(([k]) => !kept.has(k)).sort((a, b) => a[1].length - b[1].length);
    if (small.length === 0 || map.size - kept.size <= 1) break;
    const [skey, slist] = small[0];
    if (slist.length >= mergeBelow) break; // no small territory left
    const sc = centroidOf(slist);
    let bestKey: string | null = null, bestD = Infinity;
    for (const [k2, l2] of map) {
      if (k2 === skey) continue;
      const c2 = centroidOf(l2);
      const d = sc && c2 ? distKm(sc, c2) : Infinity;
      if ((!sc || !c2) ? l2.length > (bestKey ? map.get(bestKey)!.length : -1) : d < bestD) { bestKey = k2; bestD = d; }
    }
    if (bestKey && (!sc || bestD <= ABSORB_KM)) { map.get(bestKey)!.push(...slist); map.delete(skey); absorbed++; }
    else kept.add(skey); // genuinely remote → keep it, and keep absorbing the rest
  }
  return { merged: map, absorbed };
}

/** P1-A: allocate exactly K routes across territories PROPORTIONALLY to workload
 *  (largest-remainder / Hamilton method). Each territory gets ≥1 and at most its
 *  customer count; the total is adjusted to K. A territory with 10× the workload gets
 *  ~10× the routes (so a 2,800-customer city gets ~40 of 86, not 3). Pure. */
function allocateExact(parts: TisCustomer[][], K: number, wlOf: (c: TisCustomer) => number): number[] {
  const wl = parts.map((p) => p.reduce((s, c) => s + wlOf(c), 0));
  const total = wl.reduce((a, b) => a + b, 0) || 1;
  const ideal = wl.map((w) => K * w / total);
  const alloc = parts.map((p, i) => Math.max(1, Math.min(p.length, Math.floor(ideal[i]))));
  let sum = alloc.reduce((a, b) => a + b, 0);
  if (sum < K) {
    // Grow: give extra routes to the largest fractional remainders, respecting capacity.
    const order = parts.map((_, i) => i).sort((a, b) => (ideal[b] - Math.floor(ideal[b])) - (ideal[a] - Math.floor(ideal[a])) || ideal[b] - ideal[a]);
    for (let guard = 0; sum < K && guard < K * 4; guard++) {
      let placed = false;
      for (const i of order) { if (sum >= K) break; if (alloc[i] < parts[i].length) { alloc[i]++; sum++; placed = true; } }
      if (!placed) break;
    }
  } else if (sum > K) {
    // Shrink: take from the smallest-ideal territories first (keep ≥ 1).
    const order = parts.map((_, i) => i).sort((a, b) => ideal[a] - ideal[b]);
    for (let guard = 0; sum > K && guard < K * 4; guard++) {
      let removed = false;
      for (const i of order) { if (sum <= K) break; if (alloc[i] > 1) { alloc[i]--; sum--; removed = true; } }
      if (!removed) break;
    }
  }
  return alloc;
}

/**
 * Simple Route Planner "rough first cut" (MVP): split a customer set into EXACTLY K
 * geographically contiguous, workload-balanced routes via a SINGLE Hilbert pass — no
 * territory hard-partition, no small-territory absorption, no forced extra routes. It
 * deliberately trades the optimizer's hard geo-correctness for a predictable K and a
 * clean starting point the manager then corrects by hand on the map. Pure.
 */
export function simpleGeoSplit(customers: readonly TisCustomer[], routeCount: number): RoutePlan {
  const all = [...customers];
  const k = Math.max(1, Math.min(Math.round(routeCount) || 1, Math.max(1, all.length)));
  if (all.length === 0) return { routeCount: 0, assignments: [], routes: [], workloadBalancePct: 100, requestedRoutes: k, absorbedTerritories: 0, geographyRequiresRoutes: null };

  const wl = (c: TisCustomer) => customerWorkload(c) ?? 1;
  const geo = all.filter((c) => isValidGeo(c.geo));
  const noGeo = all.filter((c) => !isValidGeo(c.geo));

  // Order located customers along a Hilbert curve over their bounding box, so each
  // contiguous slice is a compact sub-area. Geo-less rows trail the sequence.
  let seq = all;
  if (geo.length > 0) {
    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    for (const c of geo) { minLat = Math.min(minLat, c.geo!.lat); maxLat = Math.max(maxLat, c.geo!.lat); minLng = Math.min(minLng, c.geo!.lng); maxLng = Math.max(maxLng, c.geo!.lng); }
    const spanLat = Math.max(1e-9, maxLat - minLat), spanLng = Math.max(1e-9, maxLng - minLng);
    const SIDE = 1 << 16;
    const code = (c: TisCustomer) => {
      const x = Math.min(SIDE - 1, Math.max(0, Math.round((c.geo!.lng - minLng) / spanLng * (SIDE - 1))));
      const y = Math.min(SIDE - 1, Math.max(0, Math.round((c.geo!.lat - minLat) / spanLat * (SIDE - 1))));
      return hilbertD(SIDE, x, y);
    };
    seq = [...geo.map((c) => ({ c, h: code(c) })).sort((a, b) => a.h - b.h).map((o) => o.c), ...noGeo];
  }

  // Cut into EXACTLY K contiguous equal-count slices (guaranteed non-empty since k ≤ N).
  const routes: RouteSummary[] = [];
  const assignments: ScenarioAssignment[] = [];
  const loads: number[] = [];
  for (let i = 0; i < k; i++) {
    const list = seq.slice(Math.floor((i * seq.length) / k), Math.floor(((i + 1) * seq.length) / k));
    if (list.length === 0) continue;
    const rid = ROUTE_ID(i);
    const load = list.reduce((s, c) => s + wl(c), 0);
    routes.push({ routeId: rid, customerIds: list.map((c) => c.id), customers: list.length, workload: round1(load), salesValue: round1(list.reduce((s, c) => s + (c.salesValue ?? 0), 0)) });
    loads.push(load);
    for (const c of list) assignments.push({ customerId: c.id, routeId: rid });
  }
  return { routeCount: routes.length, assignments, routes, workloadBalancePct: balancePct(loads), requestedRoutes: k, absorbedTerritories: 0, geographyRequiresRoutes: null };
}

/**
 * Balance a customer set into workload-even, geographically COMPACT routes — geography
 * is a HARD constraint. Territories are clustered (clusterTerritories), small/remote ones
 * are absorbed into the nearest (P1-A/C), then EXACTLY K routes are allocated across the
 * remaining territories (never exceeding the request); each territory is balanced
 * independently with adjacency-aware moves (P1-B). When more distinct far territories
 * exist than K, the minimum feasible count is produced and `geographyRequiresRoutes` is
 * set (the caller warns). `crossTerritory: true` opts out (legacy single-pass). Pure.
 */
export function balanceRoutes(customers: readonly TisCustomer[], constraints: RouteConstraints = {}): RoutePlan {
  const totalK = resolveRouteCount(customers, constraints);
  if (totalK === 0) return { routeCount: 0, assignments: [], routes: [], workloadBalancePct: 100, requestedRoutes: 0, absorbedTerritories: 0, geographyRequiresRoutes: null };

  const wlOf = (c: TisCustomer) =>
    constraints.balanceBy === 'value' ? (c.salesValue ?? 0)
    : constraints.balanceBy === 'count' ? 1
    : (customerWorkload(c) ?? 1);

  const terr = constraints.crossTerritory ? new Map<string, string>() : clusterTerritories(customers);
  const groups = new Map<string, TisCustomer[]>();
  for (const c of customers) if (isValidGeo(c.geo) && terr.has(c.id)) {
    const key = terr.get(c.id)!;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(c);
  }

  if (constraints.crossTerritory || groups.size <= 1) {
    const r = balanceWithin(customers, Math.min(totalK, Math.max(1, customers.length)), constraints, 0);
    return { routeCount: r.routes.length, assignments: r.assignments, routes: r.routes, workloadBalancePct: balancePct(r.loads), requestedRoutes: totalK, absorbedTerritories: 0, geographyRequiresRoutes: null };
  }

  // Geo-less customers attach to the largest territory.
  const largest = [...groups.entries()].sort((a, b) => b[1].length - a[1].length)[0][0];
  for (const c of customers) if (!isValidGeo(c.geo)) groups.get(largest)!.push(c);

  // P1-A/C: absorb small/remote territories, then allocate EXACTLY K (or warn).
  const { merged, absorbed } = absorbTerritories(groups, customers.length);
  const parts = [...merged.values()];
  let geographyRequiresRoutes: number | null = null;
  let alloc: number[];
  if (parts.length > totalK) { alloc = parts.map(() => 1); geographyRequiresRoutes = parts.length; }
  else { alloc = allocateExact(parts, totalK, wlOf); }

  let offset = 0;
  const allRoutes: RouteSummary[] = [], allAssign: ScenarioAssignment[] = [];
  let allLoads: number[] = [];
  parts.forEach((p, idx) => {
    const kp = Math.max(1, Math.min(alloc[idx], p.length));
    const r = balanceWithin(p, kp, constraints, offset);
    offset += r.routes.length;
    allRoutes.push(...r.routes); allAssign.push(...r.assignments); allLoads = allLoads.concat(r.loads);
  });

  return { routeCount: allRoutes.length, assignments: allAssign, routes: allRoutes, workloadBalancePct: balancePct(allLoads), requestedRoutes: totalK, absorbedTerritories: absorbed, geographyRequiresRoutes };
}

/** Per-route geographic report line. */
export interface RouteGeoStat {
  routeId: string;
  customers: number;
  /** Distinct cities/territories on this route (1 = clean). */
  cities: number;
  /** Max distance from the route centroid (km) — the route radius. */
  radiusKm: number;
  /** Mean distance from the route centroid (km). */
  meanRadiusKm: number;
  /** Compactness score 0–100 (100 = all customers at the centroid). */
  compactness: number;
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
  /** Routes with a single customer (P1-C). */
  singletonRoutes: number;
  /** Customers far (> 50 km) from their route centroid (P1-C). */
  remoteCustomers: number;
  /** Plan compactness 0–100 (mean of route compactness). */
  compactnessScore: number;
  /** Per-route report. */
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
  const REMOTE_KM = 50;
  let maxRadius = 0, remoteCustomers = 0;
  const routes: RouteGeoStat[] = [];
  for (const [rid, list] of routeCust) {
    const geo = list.filter((c) => isValidGeo(c.geo));
    const cities = new Set(geo.map((c) => terr.get(c.id)).filter((x): x is string => !!x)).size;
    let radius = 0, mean = 0; const outliers: string[] = [];
    if (geo.length > 0) {
      const cLat = geo.reduce((s, c) => s + c.geo!.lat, 0) / geo.length;
      const cLng = geo.reduce((s, c) => s + c.geo!.lng, 0) / geo.length;
      const dists = geo.map((c) => ({ id: c.id, d: distKm({ lat: cLat, lng: cLng }, c.geo!) }));
      radius = Math.max(0, ...dists.map((x) => x.d));
      mean = dists.reduce((s, x) => s + x.d, 0) / dists.length;
      for (const x of dists) { if (x.d > 25 && x.d > 2 * mean) outliers.push(x.id); if (x.d > REMOTE_KM) remoteCustomers++; }
    }
    maxRadius = Math.max(maxRadius, radius);
    const compactness = Math.round(100 * Math.max(0, 1 - radius / 50));
    const valid = cities <= 1 && radius <= maxKm;
    routes.push({ routeId: rid, customers: list.length, cities, radiusKm: round1(radius), meanRadiusKm: round1(mean), compactness, outliers, valid });
  }
  const invalidCount = routes.filter((r) => !r.valid).length;
  const singletonRoutes = routes.filter((r) => r.customers === 1).length;
  const compactnessScore = routes.length ? Math.round(routes.reduce((s, r) => s + r.compactness, 0) / routes.length) : 100;
  return { valid: invalidCount === 0, territories: new Set(terr.values()).size, maxRouteRadiusKm: round1(maxRadius), invalidCount, singletonRoutes, remoteCustomers, compactnessScore, routes };
}
