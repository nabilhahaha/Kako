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
    };
  });
}

/** Count of customers not yet assigned to any route (within the scenario). */
export function unassignedCount(dataset: TisDataset, scenario: Scenario): number {
  return applyScenario(dataset, scenario).customers.filter((c) => !c.ownership.routeId).length;
}

/** Column header for the approved route-allocation export. */
export const ROUTE_EXPORT_COLUMNS = [
  'Route', 'Customer Code', 'Customer Name', 'Frequency', 'Latitude', 'Longitude',
] as const;

/**
 * Build the approved route-allocation matrix (header + one row per customer) for the
 * .xlsx export. `routeLabelOf` maps a route id to its display label (e.g. "Route 3").
 * Customers are grouped by route (sorted), unassigned last. Pure.
 */
export function routeExportRows(
  dataset: TisDataset,
  scenario: Scenario,
  routeLabelOf: (routeId: string | null) => string,
): (string | number)[][] {
  const applied = applyScenario(dataset, scenario);
  const ids = routeIdsOf(dataset, scenario);
  const order = new Map(ids.map((id, i) => [id, i]));
  const sorted = [...applied.customers].sort((a, b) => {
    const ra = a.ownership.routeId, rb = b.ownership.routeId;
    const oa = ra ? order.get(ra) ?? 1e9 : 1e9 + 1;
    const ob = rb ? order.get(rb) ?? 1e9 : 1e9 + 1;
    return oa - ob || (a.code ?? a.id).localeCompare(b.code ?? b.id);
  });
  const rows: (string | number)[][] = [[...ROUTE_EXPORT_COLUMNS]];
  for (const c of sorted) {
    rows.push([
      routeLabelOf(c.ownership.routeId),
      c.code ?? c.id,
      c.name,
      c.frequency ? formatFrequency(c.frequency) : '',
      isValidGeo(c.geo) ? c.geo!.lat : '',
      isValidGeo(c.geo) ? c.geo!.lng : '',
    ]);
  }
  return rows;
}
