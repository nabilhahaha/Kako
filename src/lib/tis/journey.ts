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
  routeLabel: string;
}

/**
 * Build the Journey Plan export rows — ONE row per (customer × assigned weekday), sorted by
 * day then route, with a header. `dayLabel` maps a day key to a display name; `withSales`
 * appends the sales column when sales data exists.
 */
export function journeyExportRows(
  customers: JourneyExportCustomer[],
  plan: JourneyPlan,
  dayLabel: (d: JourneyDay) => string,
  withSales: boolean,
  days: readonly JourneyDay[] = JOURNEY_WORKING_DAYS,
): (string | number)[][] {
  const dayOrder = new Map(days.map((d, i) => [d, i]));
  const header = ['Route / Salesman', 'Customer Code', 'Customer Name', 'Frequency', 'Visit Day', 'Week Pattern', 'Visit Count', 'Sequence', 'Latitude', 'Longitude'];
  if (withSales) header.push('Sales');
  const out: (string | number)[][] = [header];

  const lines: { day: JourneyDay; route: string; row: (string | number)[] }[] = [];
  for (const c of customers) {
    const a = plan.assignments.get(c.id);
    if (!a) continue;
    const wp = weekPatternLabel(a.weeks);
    for (const d of a.days) {
      const row: (string | number)[] = [
        c.routeLabel, c.code ?? '', c.name, JOURNEY_FREQUENCY_LABEL[c.frequency],
        dayLabel(d), wp, a.visitCount, '' /* sequence placeholder */, c.lat, c.lng,
      ];
      if (withSales) row.push(c.sales ?? 0);
      lines.push({ day: d, route: c.routeLabel, row });
    }
  }
  lines.sort((a, b) => (dayOrder.get(a.day)! - dayOrder.get(b.day)!) || a.route.localeCompare(b.route));
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
