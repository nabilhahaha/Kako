// ============================================================================
// Journey Planning V1 — geography-aware, workload-balanced weekly journey plans.
//
// Simple but NOT random: after the manager assigns each customer a visit frequency,
// `generateJourneyPlan` distributes customers across the working days of a 4-week cycle so
// that (a) customers sharing a day are geographically close (k-means clustering within the
// route), (b) daily workload (visit count / minutes / optional sales) is balanced, and
// (c) bi-weekly / monthly cadences spread across the four weeks.
//
// No A/B/C classification, no sequencing/optimization — the manager reviews, adjusts,
// approves, exports. Pure + unit-tested (no I/O).
// ============================================================================

export type JourneyFrequency =
  | 'daily' // every working day
  | 'w1' // 1× / week
  | 'w2' // 2× / week
  | 'w3' // 3× / week
  | 'every10' // every ~10 days (≈3 visits / 4 weeks)
  | 'biweekly' // every 2 weeks
  | 'monthly'; // 1× / month

export const JOURNEY_FREQUENCIES: JourneyFrequency[] = ['daily', 'w1', 'w2', 'w3', 'every10', 'biweekly', 'monthly'];

/** Default working days of the week (Sat–Thu; Friday off — KSA FMCG). Configurable. */
export const JOURNEY_WORKING_DAYS = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu'] as const;
export type JourneyDay = (typeof JOURNEY_WORKING_DAYS)[number];

/** Default minutes of work per visit (used for workload balancing when no per-customer value). */
export const JOURNEY_DEFAULT_VISIT_MIN = 15;

/** How many distinct days a frequency needs PER WEEK (the geography constraint groups by day). */
export function daysPerWeek(f: JourneyFrequency): number {
  switch (f) {
    case 'daily': return JOURNEY_WORKING_DAYS.length;
    case 'w3': return 3;
    case 'w2': return 2;
    default: return 1; // w1 / every10 / biweekly / monthly → one weekday slot
  }
}

/** Visits per 4-week cycle (for the export "Visit Count" + workload math). */
export function visitsPerCycle(f: JourneyFrequency): number {
  switch (f) {
    case 'daily': return JOURNEY_WORKING_DAYS.length * 4;
    case 'w3': return 12;
    case 'w2': return 8;
    case 'w1': return 4;
    case 'every10': return 3;
    case 'biweekly': return 2;
    case 'monthly': return 1;
  }
}

/** The weeks (1–4) a single weekday slot is actually visited, given the cadence + a phase. */
export function weeksForCadence(f: JourneyFrequency, phase: number): number[] {
  switch (f) {
    case 'biweekly': return phase % 2 === 0 ? [1, 3] : [2, 4];
    case 'monthly': return [(phase % 4) + 1];
    case 'every10': return [1, 2, 4]; // ≈ every 10 days across a 28-day cycle
    default: return [1, 2, 3, 4]; // weekly cadences: every week
  }
}

export function weekPatternLabel(weeks: number[]): string {
  if (weeks.length === 4) return 'Weekly';
  return weeks.map((w) => `Week ${w}`).join(' & ');
}

export interface JourneyCustomer {
  id: string;
  lat: number;
  lng: number;
  frequency: JourneyFrequency;
  visitMinutes?: number;
  sales?: number;
}

/** A customer's resolved schedule: which weekday(s) and which weeks of the cycle. */
export interface JourneyAssignment {
  customerId: string;
  frequency: JourneyFrequency;
  days: JourneyDay[];
  weeks: number[];
  visitCount: number; // visits per 4-week cycle
}

export interface JourneyDayLoad {
  day: JourneyDay;
  customers: number;
  visitsPerWeek: number;
  workloadMin: number;
  sales: number;
}

export interface JourneyPlan {
  assignments: Map<string, JourneyAssignment>;
  dayLoads: JourneyDayLoad[];
}

/** A distinct map colour per working day (the journey map's primary visual signal). */
export const JOURNEY_DAY_COLORS: Record<JourneyDay, string> = {
  sat: '#2563eb', // blue
  sun: '#16a34a', // green
  mon: '#f59e0b', // amber
  tue: '#db2777', // pink
  wed: '#7c3aed', // violet
  thu: '#0891b2', // cyan
};
export function dayColorOf(day: JourneyDay): string {
  return JOURNEY_DAY_COLORS[day] ?? '#94a3b8';
}

/** A customer plus its assigned route (the unit the journey UI/KPIs work with). */
export type JourneyRoutedCustomer = JourneyCustomer & { routeId: string };

export interface JourneyRouteKpi {
  routeId: string;
  customers: number;
  visitsPerCycle: number;
  /** Bounding-box diagonal of the route's customers (km) — a quick "route length" estimate. */
  distanceKm: number;
  /** Daily-visit balance across the route's working days (100 = perfectly even). */
  workloadBalance: number;
  /** Customers with no assigned visit day. */
  uncovered: number;
  /** Working days whose visit count exceeds the route's per-day average by > 35%. */
  overloadedDays: JourneyDay[];
}

function bboxDiagonalKm(pts: { lat: number; lng: number }[]): number {
  if (pts.length < 2) return 0;
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const p of pts) { minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat); minLng = Math.min(minLng, p.lng); maxLng = Math.max(maxLng, p.lng); }
  return Math.round(haversineKm({ lat: minLat, lng: minLng }, { lat: maxLat, lng: maxLng }) * 10) / 10;
}

/** Per-route KPIs for the route-by-route journey view. */
export function journeyRouteKpis(
  customers: JourneyRoutedCustomer[],
  plan: JourneyPlan,
  days: readonly JourneyDay[] = JOURNEY_WORKING_DAYS,
): JourneyRouteKpi[] {
  const byRoute = new Map<string, JourneyRoutedCustomer[]>();
  for (const c of customers) {
    if (!byRoute.has(c.routeId)) byRoute.set(c.routeId, []);
    byRoute.get(c.routeId)!.push(c);
  }
  const out: JourneyRouteKpi[] = [];
  for (const [routeId, list] of byRoute) {
    let visits = 0, uncovered = 0;
    const dayCount: Record<string, number> = {};
    for (const d of days) dayCount[d] = 0;
    for (const c of list) {
      visits += visitsPerCycle(c.frequency);
      const a = plan.assignments.get(c.id);
      if (!a || a.days.length === 0) { uncovered++; continue; }
      for (const d of a.days) if (dayCount[d] != null) dayCount[d] += 1;
    }
    const active = days.map((d) => dayCount[d]).filter((n) => n > 0);
    const max = active.length ? Math.max(...active) : 0;
    const min = active.length ? Math.min(...active) : 0;
    const workloadBalance = max > 0 ? Math.round((1 - (max - min) / max) * 100) : 100;
    const avg = active.length ? active.reduce((s, n) => s + n, 0) / active.length : 0;
    const overloadedDays = days.filter((d) => dayCount[d] > avg * 1.35 && dayCount[d] > 0);
    out.push({ routeId, customers: list.length, visitsPerCycle: visits, distanceKm: bboxDiagonalKm(list), workloadBalance, uncovered, overloadedDays });
  }
  return out.sort((a, b) => a.routeId.localeCompare(b.routeId));
}

export type JourneyWarningKind =
  | 'no_visit_day' | 'frequency_unsatisfied' | 'duplicate_day'
  | 'day_overloaded' | 'route_too_long' | 'far_from_cluster' | 'unassigned';

export interface JourneyWarning {
  kind: JourneyWarningKind | JourneySeqWarningKind;
  routeId?: string;
  customerId?: string;
  detail: string;
}

/** Quality checks over a built plan — surfaced as warnings in the workspace. */
export function validateJourneyPlan(
  customers: JourneyRoutedCustomer[],
  plan: JourneyPlan,
  opts: { routeTooLongKm?: number; farFromClusterKm?: number; dayOverloadFactor?: number } = {},
  days: readonly JourneyDay[] = JOURNEY_WORKING_DAYS,
): JourneyWarning[] {
  const routeTooLongKm = opts.routeTooLongKm ?? 60;
  const farKm = opts.farFromClusterKm ?? 25;
  const overloadFactor = opts.dayOverloadFactor ?? 1.5;
  const warnings: JourneyWarning[] = [];
  const byId = new Map(customers.map((c) => [c.id, c]));

  // Per-customer checks.
  for (const c of customers) {
    if (!c.routeId) { warnings.push({ kind: 'unassigned', customerId: c.id, detail: c.id }); continue; }
    const a = plan.assignments.get(c.id);
    if (!a || a.days.length === 0) { warnings.push({ kind: 'no_visit_day', routeId: c.routeId, customerId: c.id, detail: c.id }); continue; }
    if (new Set(a.days).size !== a.days.length) warnings.push({ kind: 'duplicate_day', routeId: c.routeId, customerId: c.id, detail: c.id });
    if (a.days.length !== daysPerWeek(c.frequency)) warnings.push({ kind: 'frequency_unsatisfied', routeId: c.routeId, customerId: c.id, detail: `${c.frequency}: ${a.days.length}/${daysPerWeek(c.frequency)} days` });
  }

  // Per-day cluster cohesion (far-from-cluster) + global day overload.
  const dayMembers = new Map<JourneyDay, JourneyRoutedCustomer[]>();
  for (const d of days) dayMembers.set(d, []);
  for (const a of plan.assignments.values()) {
    const c = byId.get(a.customerId); if (!c) continue;
    for (const d of a.days) dayMembers.get(d)?.push(c);
  }
  const dayTotals = days.map((d) => dayMembers.get(d)!.length);
  const dayAvg = dayTotals.filter((n) => n > 0).reduce((s, n, _, arr) => s + n / arr.length, 0);
  for (const d of days) {
    const members = dayMembers.get(d)!;
    if (members.length === 0) continue;
    if (members.length > dayAvg * overloadFactor) warnings.push({ kind: 'day_overloaded', detail: `${d}: ${members.length} customers` });
    // centroid
    const cx = members.reduce((s, c) => s + c.lat, 0) / members.length;
    const cy = members.reduce((s, c) => s + c.lng, 0) / members.length;
    for (const c of members) {
      if (haversineKm(c, { lat: cx, lng: cy }) > farKm) warnings.push({ kind: 'far_from_cluster', routeId: c.routeId, customerId: c.id, detail: `${d}` });
    }
  }

  // Route length.
  for (const k of journeyRouteKpis(customers, plan, days)) {
    if (k.distanceKm > routeTooLongKm) warnings.push({ kind: 'route_too_long', routeId: k.routeId, detail: `${k.distanceKm} km` });
  }
  return warnings;
}

const R = 6371;
const toRad = (d: number) => (d * Math.PI) / 180;
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

interface Pt { lat: number; lng: number }
function centroid(pts: Pt[]): Pt {
  if (pts.length === 0) return { lat: 0, lng: 0 };
  let la = 0, ln = 0;
  for (const p of pts) { la += p.lat; ln += p.lng; }
  return { lat: la / pts.length, lng: ln / pts.length };
}

/**
 * Balanced k-means: cluster `customers` into `k` geographic groups (one per working day),
 * nudged so total per-week workload is even across groups. Deterministic (seeded by the
 * input order), a handful of Lloyd iterations. Returns the cluster index per customer.
 */
function balancedClusters(customers: JourneyCustomer[], k: number, weightOf: (c: JourneyCustomer) => number): number[] {
  const n = customers.length;
  if (k <= 1 || n === 0) return customers.map(() => 0);
  // Seed centroids by spreading across the longitude-sorted order (stable, no RNG).
  const order = customers.map((_, i) => i).sort((a, b) => customers[a].lng - customers[b].lng || customers[a].lat - customers[b].lat);
  let centers: Pt[] = Array.from({ length: k }, (_, j) => {
    const c = customers[order[Math.floor(((j + 0.5) / k) * n)]];
    return { lat: c.lat, lng: c.lng };
  });
  const assign = new Array(n).fill(0);
  const totalW = customers.reduce((s, c) => s + weightOf(c), 0);
  const targetW = totalW / k;
  for (let iter = 0; iter < 12; iter++) {
    const loads = new Array(k).fill(0);
    // Assign each customer to the nearest center, with a soft penalty for overloaded clusters.
    for (let i = 0; i < n; i++) {
      const c = customers[i];
      let best = 0, bestScore = Infinity;
      for (let j = 0; j < k; j++) {
        const d = haversineKm(c, centers[j]);
        const overload = Math.max(0, loads[j] - targetW) / (targetW || 1);
        const score = d * (1 + 0.25 * overload); // distance dominates; load gently balances
        if (score < bestScore) { bestScore = score; best = j; }
      }
      assign[i] = best;
      loads[best] += weightOf(c);
    }
    const next: Pt[] = [];
    for (let j = 0; j < k; j++) {
      const members = customers.filter((_, i) => assign[i] === j);
      next.push(members.length ? centroid(members) : centers[j]);
    }
    centers = next;
  }
  return assign;
}

/**
 * Generate a geography-aware, workload-balanced journey plan for ONE route's customers.
 * `existing` lets a regenerate preserve manual day moves (not used by V1 caller yet).
 */
export function generateJourneyPlan(customers: JourneyCustomer[], days: readonly JourneyDay[] = JOURNEY_WORKING_DAYS): JourneyPlan {
  const k = days.length;
  const weightOf = (c: JourneyCustomer) => (c.visitMinutes ?? JOURNEY_DEFAULT_VISIT_MIN) * (daysPerWeek(c.frequency));
  const clusters = balancedClusters(customers, k, weightOf);
  const centers: Pt[] = days.map((_, j) => centroid(customers.filter((_, i) => clusters[i] === j)));

  const assignments = new Map<string, JourneyAssignment>();
  // Phase counters per day → spread biweekly/monthly across weeks evenly.
  const phaseByDay = new Array(k).fill(0);

  customers.forEach((c, i) => {
    const home = clusters[i];
    const dpw = daysPerWeek(c.frequency);
    let dayIdx: number[];
    if (c.frequency === 'daily') {
      dayIdx = days.map((_, j) => j);
    } else if (dpw === 1) {
      dayIdx = [home];
    } else {
      // Multi-visit/week: home day + the (dpw-1) nearest OTHER day-clusters, so each extra
      // visit still lands on a day whose area is close to this customer.
      const others = days
        .map((_, j) => j)
        .filter((j) => j !== home)
        .sort((a, b) => haversineKm(c, centers[a]) - haversineKm(c, centers[b]));
      dayIdx = [home, ...others.slice(0, dpw - 1)].sort((a, b) => a - b);
    }
    const phase = phaseByDay[home]++;
    const weeks = weeksForCadence(c.frequency, phase);
    assignments.set(c.id, {
      customerId: c.id,
      frequency: c.frequency,
      days: dayIdx.map((j) => days[j]),
      weeks,
      visitCount: visitsPerCycle(c.frequency),
    });
  });

  return { assignments, dayLoads: computeDayLoads(customers, assignments, days) };
}

/** Recompute per-day workload from the current assignments (after manual moves too). */
export function computeDayLoads(customers: JourneyCustomer[], assignments: Map<string, JourneyAssignment>, days: readonly JourneyDay[] = JOURNEY_WORKING_DAYS): JourneyDayLoad[] {
  const byId = new Map(customers.map((c) => [c.id, c]));
  const loads: Record<string, JourneyDayLoad> = {};
  for (const d of days) loads[d] = { day: d, customers: 0, visitsPerWeek: 0, workloadMin: 0, sales: 0 };
  for (const a of assignments.values()) {
    const c = byId.get(a.customerId);
    if (!c) continue;
    // A representative week's visits: how many of the customer's assigned weekdays fall in a
    // typical week (weekly cadences = all days; biweekly/monthly average < 1 per slot).
    const weekFraction = a.weeks.length / 4; // share of weeks this slot is active
    for (const d of a.days) {
      const L = loads[d];
      if (!L) continue;
      L.customers += 1;
      L.visitsPerWeek += weekFraction;
      L.workloadMin += (c.visitMinutes ?? JOURNEY_DEFAULT_VISIT_MIN) * weekFraction;
      L.sales += (c.sales ?? 0) * weekFraction;
    }
  }
  return days.map((d) => loads[d]);
}

/** Stable English labels for the export (the UI uses i18n separately). */
export const JOURNEY_FREQUENCY_LABEL: Record<JourneyFrequency, string> = {
  daily: 'Daily', w1: '1× / week', w2: '2× / week', w3: '3× / week',
  every10: 'Every 10 days', biweekly: 'Every 2 weeks', monthly: 'Monthly',
};

export interface JourneyExportCustomer extends JourneyCustomer {
  code: string | null;
  name: string;
  routeId: string;
  routeLabel: string;
}

const ptText = (p?: JourneyPoint): string => (p ? (p.name ? `${p.name} (${p.lat.toFixed(5)}, ${p.lng.toFixed(5)})` : `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`) : '');

/**
 * Build the Journey Plan export rows — ONE row per (customer × assigned weekday), sorted by
 * day then route then sequence number. `dayLabel` maps a day key to a display name;
 * `withSales` appends the sales column. When `sequences` is supplied, the Sequence Number /
 * Start Point / End Point columns are filled; otherwise they are blank (export still works).
 */
export function journeyExportRows(
  customers: JourneyExportCustomer[],
  plan: JourneyPlan,
  dayLabel: (d: JourneyDay) => string,
  withSales: boolean,
  sequences?: Map<SeqKey, DaySequence>,
  days: readonly JourneyDay[] = JOURNEY_WORKING_DAYS,
): (string | number)[][] {
  const dayOrder = new Map(days.map((d, i) => [d, i]));
  const header = ['Route / Salesman', 'Visit Day', 'Week Pattern', 'Customer Code', 'Customer Name', 'Frequency', 'Visit Count', 'Sequence Number', 'Start Point', 'End Point', 'Latitude', 'Longitude'];
  if (withSales) header.push('Sales');
  const out: (string | number)[][] = [header];

  const lines: { day: JourneyDay; route: string; seq: number; row: (string | number)[] }[] = [];
  for (const c of customers) {
    const a = plan.assignments.get(c.id);
    if (!a) continue;
    const wp = weekPatternLabel(a.weeks);
    for (const d of a.days) {
      const ds = sequences?.get(seqKey(c.routeId, d));
      const seqNum = sequences ? sequenceNumberOf(sequences, c.routeId, d, c.id) : null;
      const row: (string | number)[] = [
        c.routeLabel, dayLabel(d), wp, c.code ?? '', c.name, JOURNEY_FREQUENCY_LABEL[c.frequency],
        a.visitCount, seqNum ?? '', ptText(ds?.start), ptText(ds?.end), c.lat, c.lng,
      ];
      if (withSales) row.push(c.sales ?? 0);
      lines.push({ day: d, route: c.routeLabel, seq: seqNum ?? 9999, row });
    }
  }
  lines.sort((a, b) => (dayOrder.get(a.day)! - dayOrder.get(b.day)!) || a.route.localeCompare(b.route) || a.seq - b.seq);
  for (const l of lines) out.push(l.row);
  return out;
}

/** Move a customer to a single specific day (manual adjust); keeps weeks/frequency. */
export function moveCustomerToDay(plan: JourneyPlan, customers: JourneyCustomer[], customerId: string, day: JourneyDay, days: readonly JourneyDay[] = JOURNEY_WORKING_DAYS): JourneyPlan {
  const a = plan.assignments.get(customerId);
  if (!a) return plan;
  const next = new Map(plan.assignments);
  next.set(customerId, { ...a, days: [day] });
  return { assignments: next, dayLoads: computeDayLoads(customers, next, days) };
}

// ============================================================================
// Optional Start / End sequencing (V1) — order each route×day from a Start point to an
// End point. Practical ordering only: nearest-neighbour, no road API, no time math.
// ============================================================================

export interface JourneyPoint { lat: number; lng: number; name?: string }
export interface RouteStartEnd { start?: JourneyPoint; end?: JourneyPoint }

/** SeqKey identifies one trip = a (route, day) pair. */
export type SeqKey = string;
export function seqKey(routeId: string, day: JourneyDay): SeqKey { return routeId + ' § ' + day; }

export interface DaySequence {
  routeId: string;
  day: JourneyDay;
  order: string[]; // ordered customer ids for this route+day
  start: JourneyPoint;
  end: JourneyPoint;
  startFallback: boolean; // true when no start was configured (route centroid used)
  endFallback: boolean; // true when no end was configured (farthest customer used)
}

/**
 * Nearest-neighbour order from `start`, finishing at the member nearest `end`. Simple +
 * deterministic; good enough for practical daily execution (no traffic optimisation).
 */
export function sequenceStops(members: { id: string; lat: number; lng: number }[], start: JourneyPoint, end: JourneyPoint): string[] {
  if (members.length <= 1) return members.map((m) => m.id);
  let lastIdx = 0, lastD = Infinity;
  members.forEach((m, i) => { const d = haversineKm(m, end); if (d < lastD) { lastD = d; lastIdx = i; } });
  const last = members[lastIdx];
  const remaining = members.filter((_, i) => i !== lastIdx);
  const order: string[] = [];
  let cur: { lat: number; lng: number } = start;
  while (remaining.length) {
    let bi = 0, bd = Infinity;
    remaining.forEach((m, i) => { const d = haversineKm(cur, m); if (d < bd) { bd = d; bi = i; } });
    const next = remaining.splice(bi, 1)[0];
    order.push(next.id);
    cur = next;
  }
  order.push(last.id);
  return order;
}

/**
 * Build per-(route,day) sequences from the plan. Routes without a configured start/end fall
 * back to the route centroid (start) and the farthest customer from it (end), flagged so the
 * UI/export can label them.
 */
export function buildJourneySequences(
  customers: JourneyRoutedCustomer[],
  plan: JourneyPlan,
  startEndByRoute: Map<string, RouteStartEnd>,
  onlyRoute?: string,
): Map<SeqKey, DaySequence> {
  const byId = new Map(customers.map((c) => [c.id, c]));
  const routeMembers = new Map<string, JourneyRoutedCustomer[]>();
  for (const c of customers) { if (!routeMembers.has(c.routeId)) routeMembers.set(c.routeId, []); routeMembers.get(c.routeId)!.push(c); }

  const groups = new Map<SeqKey, { routeId: string; day: JourneyDay; members: JourneyRoutedCustomer[] }>();
  for (const a of plan.assignments.values()) {
    const c = byId.get(a.customerId); if (!c) continue;
    if (onlyRoute && c.routeId !== onlyRoute) continue;
    for (const d of a.days) {
      const k = seqKey(c.routeId, d);
      if (!groups.has(k)) groups.set(k, { routeId: c.routeId, day: d, members: [] });
      groups.get(k)!.members.push(c);
    }
  }

  const out = new Map<SeqKey, DaySequence>();
  for (const [k, g] of groups) {
    if (g.members.length === 0) continue;
    const se = startEndByRoute.get(g.routeId) ?? {};
    let start = se.start, startFallback = false;
    let end = se.end, endFallback = false;
    if (!start) { start = centroid(routeMembers.get(g.routeId)!); startFallback = true; }
    if (!end) {
      let far = g.members[0], fd = -1;
      for (const m of g.members) { const d = haversineKm(start, m); if (d > fd) { fd = d; far = m; } }
      end = { lat: far.lat, lng: far.lng }; endFallback = true;
    }
    out.set(k, { routeId: g.routeId, day: g.day, order: sequenceStops(g.members.map((m) => ({ id: m.id, lat: m.lat, lng: m.lng })), start, end), start, end, startFallback, endFallback });
  }
  return out;
}

/** 1-based stop number for a customer on a given (route, day), or null when not sequenced. */
export function sequenceNumberOf(sequences: Map<SeqKey, DaySequence>, routeId: string, day: JourneyDay, customerId: string): number | null {
  const s = sequences.get(seqKey(routeId, day));
  if (!s) return null;
  const i = s.order.indexOf(customerId);
  return i < 0 ? null : i + 1;
}

export type JourneySeqWarningKind =
  | 'seq_missing_start' | 'seq_missing_end' | 'seq_empty_day' | 'seq_not_generated'
  | 'seq_no_number' | 'seq_duplicate' | 'seq_incomplete';

/** Quality checks specific to sequencing — surfaced alongside the plan warnings. */
export function validateSequencing(
  customers: JourneyRoutedCustomer[],
  plan: JourneyPlan,
  sequences: Map<SeqKey, DaySequence>,
): JourneyWarning[] {
  const out: JourneyWarning[] = [];
  const byId = new Map(customers.map((c) => [c.id, c]));
  const planned = new Map<SeqKey, { routeId: string; day: JourneyDay; ids: Set<string> }>();
  for (const a of plan.assignments.values()) {
    const c = byId.get(a.customerId); if (!c) continue;
    for (const d of a.days) {
      const k = seqKey(c.routeId, d);
      if (!planned.has(k)) planned.set(k, { routeId: c.routeId, day: d, ids: new Set() });
      planned.get(k)!.ids.add(c.id);
    }
  }
  for (const [k, p] of planned) {
    const s = sequences.get(k);
    if (!s) { out.push({ kind: 'seq_not_generated', routeId: p.routeId, detail: p.day }); continue; }
    if (s.startFallback) out.push({ kind: 'seq_missing_start', routeId: p.routeId, detail: p.day });
    if (s.endFallback) out.push({ kind: 'seq_missing_end', routeId: p.routeId, detail: p.day });
    if (new Set(s.order).size !== s.order.length) out.push({ kind: 'seq_duplicate', routeId: p.routeId, detail: p.day });
    if (s.order.length < p.ids.size) out.push({ kind: 'seq_incomplete', routeId: p.routeId, detail: `${s.order.length}/${p.ids.size}` });
    for (const id of p.ids) if (!s.order.includes(id)) out.push({ kind: 'seq_no_number', routeId: p.routeId, customerId: id, detail: p.day });
  }
  return out;
}
