/**
 * Route execution — pure helpers (no I/O). Compute completion %, the next stop,
 * missed customers, GPS-compliance rate and an overall route-health band from
 * already-authorized journey data. Sequence optimization is handled by the
 * existing `journey-sort` engine; this module is the execution math. Patterns
 * adapted from Pepperi / Repsly / BeatRoute / FieldAssist / StayinFront route
 * execution. Pure + testable.
 */

export interface RouteStopLike {
  customer_id: string;
  sequence: number;
}

export interface RouteCompletion {
  planned: number;
  visited: number;
  remaining: number;
  pct: number; // 0..100
}

/** Completion of a route given its stops and the set of visited customer ids. */
export function routeCompletion(stops: readonly RouteStopLike[], visitedIds: readonly string[]): RouteCompletion {
  const visitedSet = new Set(visitedIds);
  const planned = stops.length;
  const visited = stops.filter((s) => visitedSet.has(s.customer_id)).length;
  const remaining = Math.max(0, planned - visited);
  const pct = planned === 0 ? 0 : Math.round((visited / planned) * 100);
  return { planned, visited, remaining, pct };
}

/** Stops not yet visited, in sequence order (the "missed / remaining" list). */
export function missedStops<T extends RouteStopLike>(stops: readonly T[], visitedIds: readonly string[]): T[] {
  const visitedSet = new Set(visitedIds);
  return stops.filter((s) => !visitedSet.has(s.customer_id)).sort((a, b) => a.sequence - b.sequence);
}

/** The next customer to visit: the lowest-sequence un-visited stop. */
export function nextStop<T extends RouteStopLike>(stops: readonly T[], visitedIds: readonly string[]): T | null {
  return missedStops(stops, visitedIds)[0] ?? null;
}

/** GPS-compliance rate: share of visits that were NOT GPS violations (0..100). */
export function gpsComplianceRate(totalVisits: number, violations: number): number {
  if (totalVisits <= 0) return 100;
  const ok = Math.max(0, totalVisits - Math.max(0, violations));
  return Math.round((ok / totalVisits) * 100);
}

export type RouteHealthBand = 'good' | 'attention' | 'critical' | 'none';

export interface RouteHealth {
  score: number; // 0..100
  band: RouteHealthBand;
}

/** Overall route health: completion driven, penalized by GPS / out-of-route flags. */
export function routeHealth(completionPct: number, gpsViolations = 0, outOfRoute = 0): RouteHealth {
  const penalty = Math.min(40, gpsViolations * 8 + outOfRoute * 5);
  const score = Math.max(0, Math.min(100, Math.round(completionPct - penalty)));
  const band: RouteHealthBand = completionPct === 0 ? 'none' : score >= 80 ? 'good' : score >= 50 ? 'attention' : 'critical';
  return { score, band };
}
