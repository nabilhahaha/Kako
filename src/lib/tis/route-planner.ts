/**
 * Simple Route Planner (MVP) — pure helpers for the manager-facing surface:
 *  • `routeStats` — the per-route side-panel signals (count · weekly visits ·
 *    estimated workload hours · colour), computed over a scenario.
 *  • `routeExportRows` — the approved route-allocation matrix for the .xlsx export.
 * No I/O; all logic is deterministic and unit-tested. The Journey Plan (frequencies,
 * day rules, sequence) is a later phase (P4–P5) and intentionally NOT here.
 */
import { applyScenario, type Scenario } from './scenario';
import { customerWorkload, isValidGeo, type TisCustomer, type TisDataset } from './dataset';
import { validatePlanGeography } from './optimize-routes';
import { formatFrequency } from '@/lib/route-optimization/visit-frequency';
import { defaultVisitDurationConfig, visitMinutesPerWeek } from '@/lib/planning/visit-duration';

/** A 12-colour rotation shared with the planning board (stable per sorted route id). */
export const ROUTE_PALETTE = [
  '#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2',
  '#db2777', '#65a30d', '#ea580c', '#4f46e5', '#0d9488', '#9333ea',
] as const;

export interface RouteStat {
  routeId: string;
  /** 1-based display index in the sorted route order. */
  index: number;
  color: string;
  customers: number;
  /** Σ visits/week across the route's customers (rounded). */
  weeklyVisits: number;
  /** Estimated field workload in hours/week (visits × visit-duration). */
  workloadHours: number;
  /** Σ sales value across the route's customers (0 when no sales data). */
  sales: number;
}

/** Stable sorted route ids for the scenario (unassigned excluded). */
export function routeIdsOf(dataset: TisDataset, scenario: Scenario): string[] {
  const applied = applyScenario(dataset, scenario);
  return [...new Set(applied.customers.map((c) => c.ownership.routeId).filter((r): r is string => !!r))].sort();
}

/** Route id → stable colour map (sorted order, 12-colour rotation). */
export function routeColors(dataset: TisDataset, scenario: Scenario): Map<string, string> {
  const ids = routeIdsOf(dataset, scenario);
  return new Map(ids.map((id, i) => [id, ROUTE_PALETTE[i % ROUTE_PALETTE.length]]));
}

/**
 * Per-route side-panel stats: customer count, weekly visit count, estimated workload
 * (hours/week), and colour. Sorted by route id (matches the colour map). Customers
 * with no route are excluded (they show as "Unassigned" in the UI separately).
 */
export function routeStats(dataset: TisDataset, scenario: Scenario): RouteStat[] {
  const applied = applyScenario(dataset, scenario);
  const cfg = defaultVisitDurationConfig();
  const ids = routeIdsOf(dataset, scenario);
  const colors = routeColors(dataset, scenario);
  const byRoute = new Map<string, TisCustomer[]>();
  for (const c of applied.customers) {
    const r = c.ownership.routeId;
    if (!r) continue;
    (byRoute.get(r) ?? byRoute.set(r, []).get(r)!).push(c);
  }
  return ids.map((routeId, i) => {
    const list = byRoute.get(routeId) ?? [];
    const visits = list.reduce((s, c) => s + (customerWorkload(c) ?? 0), 0);
    const minutes = list.reduce((s, c) => s + visitMinutesPerWeek({ durationMin: null, channel: null, grade: c.grade, frequency: c.frequency }, cfg), 0);
    return {
      routeId,
      index: i + 1,
      color: colors.get(routeId) ?? '#94a3b8',
      customers: list.length,
      weeklyVisits: Math.round(visits),
      workloadHours: Math.round((minutes / 60) * 10) / 10,
      sales: Math.round(list.reduce((s, c) => s + (c.salesValue ?? 0), 0)),
    };
  });
}

/** True when any customer in the dataset carries a sales value (drives the optional
 *  sales UI/exports). Pure. */
export function hasSalesData(dataset: TisDataset): boolean {
  return dataset.customers.some((c) => c.salesValue != null);
}

/** Customers not assigned to any route (the "Needs Review" bucket). */
export function needsReviewCustomers(dataset: TisDataset, scenario: Scenario): TisCustomer[] {
  return applyScenario(dataset, scenario).customers.filter((c) => !c.ownership.routeId);
}

/** Count of customers in the Needs Review / Unassigned bucket. */
export function unassignedCount(dataset: TisDataset, scenario: Scenario): number {
  return needsReviewCustomers(dataset, scenario).length;
}

// ── Route geometry (boundaries + radius/compactness) for the review workflow ───

export type LngLat = [number, number];

/** Convex hull (Andrew's monotone chain) over lng/lat points. Returns an open ring
 *  (caller closes it for a GeoJSON polygon). Planar approximation — fine for drawing
 *  a territory outline at city scale. < 3 points → the points themselves. Pure. */
export function convexHull(points: readonly { lng: number; lat: number }[]): LngLat[] {
  const pts = points.map((p) => [p.lng, p.lat] as LngLat).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o: LngLat, a: LngLat, b: LngLat) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: LngLat[] = [];
  for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  const upper: LngLat[] = [];
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  lower.pop(); upper.pop();
  return lower.concat(upper);
}

export interface RouteReview extends RouteStat {
  /** Max distance from the route centroid (km) — the route radius. */
  radiusKm: number;
  /** Mean distance from the route centroid (km). */
  meanRadiusKm: number;
  /** Span: distance across the route's bounding box (km) — farthest-apart proxy. */
  spanKm: number;
  /** Compactness score 0–100 (100 = tight). */
  compactness: number;
  /** Convex-hull ring [lng,lat] of the route's located customers (open). */
  hull: LngLat[];
}

const haversineKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6371, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
};

/** Bounding-box diagonal (km) of a route's points — a cheap farthest-apart proxy. */
function spanKmOf(points: readonly { lng: number; lat: number }[]): number {
  if (points.length < 2) return 0;
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
  for (const p of points) { minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat); minLng = Math.min(minLng, p.lng); maxLng = Math.max(maxLng, p.lng); }
  return Math.round(haversineKm({ lat: minLat, lng: minLng }, { lat: maxLat, lng: maxLng }) * 10) / 10;
}

/**
 * Per-route review record: the side-panel stats plus geographic radius, compactness
 * and a convex-hull boundary — everything the map and the route-summary panel need.
 * Radius/compactness reuse the shared `validatePlanGeography` engine. Pure.
 */
export function routeReview(dataset: TisDataset, scenario: Scenario): RouteReview[] {
  const stats = routeStats(dataset, scenario);
  const applied = applyScenario(dataset, scenario);
  const assignments = applied.customers.map((c) => ({ customerId: c.id, routeId: c.ownership.routeId }));
  const geo = validatePlanGeography(applied.customers, assignments);
  const geoById = new Map(geo.routes.map((r) => [r.routeId, r]));
  const byRoute = new Map<string, { lng: number; lat: number }[]>();
  for (const c of applied.customers) {
    const r = c.ownership.routeId;
    if (!r || !isValidGeo(c.geo)) continue;
    (byRoute.get(r) ?? byRoute.set(r, []).get(r)!).push({ lng: c.geo!.lng, lat: c.geo!.lat });
  }
  return stats.map((s) => {
    const pts = byRoute.get(s.routeId) ?? [];
    return {
      ...s,
      radiusKm: geoById.get(s.routeId)?.radiusKm ?? 0,
      meanRadiusKm: geoById.get(s.routeId)?.meanRadiusKm ?? 0,
      spanKm: spanKmOf(pts),
      compactness: geoById.get(s.routeId)?.compactness ?? 0,
      hull: convexHull(pts),
    };
  });
}

export interface ReviewAggregate {
  routes: number;
  customers: number;
  weeklyVisits: number;
  workloadHours: number;
  /** Max route radius across the set (km). */
  maxRadiusKm: number;
  /** Mean of per-route mean-distance-from-centre across the set (km). */
  avgMeanRadiusKm: number;
  /** Max route span across the set (km). */
  maxSpanKm: number;
  /** Mean compactness across the set. */
  compactness: number;
  /** Σ sales value across the set (0 when no sales data). */
  totalSales: number;
  /** Mean sales value per customer across the set. */
  avgSalesPerCustomer: number;
}

/** Aggregate the review stats over a set of focused routes (all when `focused` empty). */
export function aggregateReview(reviews: readonly RouteReview[], focused: ReadonlySet<string>): ReviewAggregate {
  const set = focused.size ? reviews.filter((r) => focused.has(r.routeId)) : reviews;
  if (set.length === 0) return { routes: 0, customers: 0, weeklyVisits: 0, workloadHours: 0, maxRadiusKm: 0, avgMeanRadiusKm: 0, maxSpanKm: 0, compactness: 0, totalSales: 0, avgSalesPerCustomer: 0 };
  const customers = set.reduce((n, r) => n + r.customers, 0);
  const totalSales = set.reduce((n, r) => n + r.sales, 0);
  return {
    routes: set.length,
    customers,
    weeklyVisits: set.reduce((n, r) => n + r.weeklyVisits, 0),
    workloadHours: Math.round(set.reduce((n, r) => n + r.workloadHours, 0) * 10) / 10,
    maxRadiusKm: Math.round(Math.max(...set.map((r) => r.radiusKm)) * 10) / 10,
    avgMeanRadiusKm: Math.round((set.reduce((n, r) => n + r.meanRadiusKm, 0) / set.length) * 10) / 10,
    maxSpanKm: Math.round(Math.max(...set.map((r) => r.spanKm)) * 10) / 10,
    compactness: Math.round(set.reduce((n, r) => n + r.compactness, 0) / set.length),
    totalSales,
    avgSalesPerCustomer: customers ? Math.round(totalSales / customers) : 0,
  };
}

/** Ids of Needs Review / Unassigned customers (for "select all" on the map). */
export function unassignedIds(dataset: TisDataset, scenario: Scenario): string[] {
  return needsReviewCustomers(dataset, scenario).map((c) => c.id);
}

/** Column header for the approved route-allocation export. */
export const ROUTE_EXPORT_COLUMNS = [
  'Route', 'Customer Code', 'Customer Name', 'Frequency', 'Latitude', 'Longitude',
] as const;

const customerRow = (c: TisCustomer, label: string): (string | number)[] => [
  label,
  c.code ?? c.id,
  c.name,
  c.frequency ? formatFrequency(c.frequency) : '',
  isValidGeo(c.geo) ? c.geo!.lat : '',
  isValidGeo(c.geo) ? c.geo!.lng : '',
];

/**
 * Approved route-allocation matrix (header + one row per ASSIGNED customer), grouped
 * by route (sorted). `routeLabelOf` maps a route id to its display label. Needs Review
 * customers are NOT here — they go to their own sheet (see `needsReviewExportRows`). Pure.
 */
export function routeExportRows(
  dataset: TisDataset,
  scenario: Scenario,
  routeLabelOf: (routeId: string | null) => string,
): (string | number)[][] {
  const applied = applyScenario(dataset, scenario);
  const ids = routeIdsOf(dataset, scenario);
  const order = new Map(ids.map((id, i) => [id, i]));
  const sorted = applied.customers
    .filter((c) => c.ownership.routeId)
    .sort((a, b) => (order.get(a.ownership.routeId!) ?? 1e9) - (order.get(b.ownership.routeId!) ?? 1e9) || (a.code ?? a.id).localeCompare(b.code ?? b.id));
  return [[...ROUTE_EXPORT_COLUMNS], ...sorted.map((c) => customerRow(c, routeLabelOf(c.ownership.routeId)))];
}

/** The "Needs Review" sheet matrix — one row per unassigned customer. Pure. */
export function needsReviewExportRows(dataset: TisDataset, scenario: Scenario): (string | number)[][] {
  const review = needsReviewCustomers(dataset, scenario)
    .sort((a, b) => (a.code ?? a.id).localeCompare(b.code ?? b.id));
  return [[...ROUTE_EXPORT_COLUMNS], ...review.map((c) => customerRow(c, 'Needs Review'))];
}

// ── Current Allocation Review: change export (baseline vs working) ─────────────

export type RouteChangeType = 'Moved' | 'Newly Assigned' | 'Unchanged' | 'Needs Review';

function changeTypeOf(prev: string | null, next: string | null): RouteChangeType {
  if (!next) return 'Needs Review';
  if (!prev) return 'Newly Assigned';
  return prev === next ? 'Unchanged' : 'Moved';
}

export const ROUTE_CHANGES_COLUMNS = [
  'Customer Code', 'Customer Name', 'Previous Route / Salesman', 'New Route / Salesman', 'Change Type', 'Latitude', 'Longitude',
] as const;

/**
 * "Route Changes" sheet — one row per customer comparing the loaded baseline
 * allocation to the working one, with Previous/New labels and a change type
 * (Moved · Newly Assigned · Unchanged · Needs Review). When `withSales`, appends the
 * customer's Sales Value and its sales impact on the previous / new route. Pure.
 */
export function routeChangeRows(
  dataset: TisDataset,
  baseline: Scenario,
  working: Scenario,
  labelOf: (routeId: string | null) => string,
  withSales = false,
): (string | number)[][] {
  const base = applyScenario(dataset, baseline).customers;
  const next = new Map(applyScenario(dataset, working).customers.map((c) => [c.id, c.ownership.routeId]));
  const header: (string | number)[] = [...ROUTE_CHANGES_COLUMNS];
  if (withSales) header.push('Sales Value', 'Previous Route Sales Impact', 'New Route Sales Impact');
  const rows: (string | number)[][] = [header];
  for (const c of base) {
    const prev = c.ownership.routeId;
    const nxt = next.get(c.id) ?? null;
    const row: (string | number)[] = [
      c.code ?? c.id, c.name,
      prev ? labelOf(prev) : '', nxt ? labelOf(nxt) : '(needs review)',
      changeTypeOf(prev, nxt),
      isValidGeo(c.geo) ? c.geo!.lat : '', isValidGeo(c.geo) ? c.geo!.lng : '',
    ];
    if (withSales) {
      const sv = c.salesValue;
      const changed = prev !== nxt;
      row.push(
        sv ?? '',
        changed && prev && sv != null ? -sv : '',  // sales the previous route loses
        changed && nxt && sv != null ? sv : '',     // sales the new route gains
      );
    }
    rows.push(row);
  }
  return rows;
}

/**
 * "Change Summary" sheet — totals (unchanged · moved · newly assigned · needs review ·
 * affected routes) then a per-route Before/After/Difference table. When `withSales`,
 * the totals add Total Sales and the per-route table adds Before/After/Diff sales. Pure.
 */
export function changeSummaryRows(
  dataset: TisDataset,
  baseline: Scenario,
  working: Scenario,
  labelOf: (routeId: string | null) => string,
  withSales = false,
): (string | number)[][] {
  const base = applyScenario(dataset, baseline).customers;
  const next = new Map(applyScenario(dataset, working).customers.map((c) => [c.id, c.ownership.routeId]));
  let unchanged = 0, moved = 0, newly = 0, review = 0, totalSales = 0;
  const before = new Map<string, number>(), after = new Map<string, number>();
  const beforeSales = new Map<string, number>(), afterSales = new Map<string, number>();
  for (const c of base) {
    const prev = c.ownership.routeId, nxt = next.get(c.id) ?? null, sv = c.salesValue ?? 0;
    const t = changeTypeOf(prev, nxt);
    if (t === 'Unchanged') unchanged++; else if (t === 'Moved') moved++; else if (t === 'Newly Assigned') newly++; else review++;
    totalSales += sv;
    if (prev) { before.set(prev, (before.get(prev) ?? 0) + 1); beforeSales.set(prev, (beforeSales.get(prev) ?? 0) + sv); }
    if (nxt) { after.set(nxt, (after.get(nxt) ?? 0) + 1); afterSales.set(nxt, (afterSales.get(nxt) ?? 0) + sv); }
  }
  const perRoute = [...new Set([...before.keys(), ...after.keys()])]
    .map((r) => ({ r, before: before.get(r) ?? 0, after: after.get(r) ?? 0, diff: (after.get(r) ?? 0) - (before.get(r) ?? 0), beforeS: Math.round(beforeSales.get(r) ?? 0), afterS: Math.round(afterSales.get(r) ?? 0) }))
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  const affected = perRoute.filter((x) => x.diff !== 0).length;
  const totals: (string | number)[][] = [
    ['Change Summary'],
    ['Total customers', base.length],
    ['Unchanged', unchanged],
    ['Moved', moved],
    ['Newly assigned', newly],
    ['Needs Review', review],
    ['Affected routes', affected],
  ];
  if (withSales) totals.push(['Total sales', Math.round(totalSales)]);
  const head: (string | number)[] = withSales
    ? ['Route / Salesman', 'Before Customers', 'After Customers', 'Customer Diff', 'Before Sales', 'After Sales', 'Sales Diff']
    : ['Route / Salesman', 'Before', 'After', 'Difference'];
  const table = perRoute.map((x) => (withSales
    ? [labelOf(x.r), x.before, x.after, x.diff, x.beforeS, x.afterS, x.afterS - x.beforeS]
    : [labelOf(x.r), x.before, x.after, x.diff]));
  return [...totals, [], head, ...table];
}
