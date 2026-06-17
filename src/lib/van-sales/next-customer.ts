// ============================================================================
// Smart Next Customer — pure ranking engine (client- and server-safe).
//
// PRIMARY OBJECTIVE: preserve route execution. Candidates are ALWAYS today's
// remaining route stops (active AND not visited AND on today's route — route
// protection by construction). They are then ranked route-first:
//
//   score = routeRank · routeStepMeters  +  distanceM
//
//   1. Route sequence is the dominant axis — each step further down the plan
//      adds `routeStepMeters`, so the planned order is followed by default.
//   2. Distance refines INTELLIGENTLY — a later stop is only promoted ahead of
//      an earlier one when it is *significantly* closer (more than ~one route
//      step). A slightly-closer far-ahead stop never breaks the route.
//   3. Customer priority — FUTURE (overdue / collection / visit / supervisor /
//      A·B·C classification add weighted terms here; unused today).
//
// No GPS → distance is null and the list falls back to pure sequence order.
// No I/O, no React — unit-testable in isolation.
// ============================================================================

export interface GpsPoint {
  lat: number;
  lng: number;
}

export interface NextCandidate {
  customerId: string;
  name: string;
  nameAr?: string | null;
  /** Position on today's route. */
  sequence: number;
  latitude: number | null;
  longitude: number | null;
  /** Has overdue receivables (older than payment terms). */
  overdue: boolean;
  /** Over / near the credit limit. */
  creditWarning: boolean;
  /** Already visited today (excluded). */
  visited: boolean;
  /** Active customer (inactive excluded). */
  active: boolean;
  /** Optional future signals (unused in the current route+distance ranking). */
  overdueAmount?: number;
  classification?: 'A' | 'B' | 'C' | null;
  visitPriority?: number;
  supervisorPriority?: number;
}

export interface RankedCandidate extends NextCandidate {
  /** Metres from the origin, or null when GPS / customer location is missing. */
  distanceM: number | null;
  /** 0-based position among the remaining route stops (route adherence axis). */
  routeRank: number;
  /** Lower is better. */
  score: number;
}

/** Weights for the route-first score. Today only route + distance are applied. */
export interface RankWeights {
  /**
   * Metres-equivalent penalty per route step out of sequence — the route-
   * adherence strength. A later stop must be more than this many metres closer
   * to be promoted ahead of an earlier one. Higher = stricter route following.
   */
  routeStepMeters?: number;
  /**
   * Route-chaos guard: when the next planned stop (route rank 0) is within this
   * many metres of the rep, it is ALWAYS recommended first — the engine only
   * reorders when the planned stop is far enough that a meaningful saving exists.
   * (A future time threshold, e.g. 5 min, maps onto this distance.)
   */
  nearThresholdMeters?: number;
  // ── FUTURE signals (not yet applied) ──
  overduePerUnit?: number;
  collectionPerUnit?: number;
  visitPriority?: number;
  supervisorPriority?: number;
  classification?: number;
}

const DEFAULT_STEP_M = 400;
const DEFAULT_NEAR_M = 1000;
export const DEFAULT_WEIGHTS: RankWeights = { routeStepMeters: DEFAULT_STEP_M, nearThresholdMeters: DEFAULT_NEAR_M };

/** Great-circle distance in metres (Haversine). */
export function haversineMeters(a: GpsPoint, b: GpsPoint): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Route protection: active AND not visited. (Candidates are already route stops.) */
export function isEligible(c: NextCandidate): boolean {
  return c.active && !c.visited;
}

/**
 * Rank the eligible next customers ROUTE-FIRST. Distance refines the planned
 * order but cannot break it for a marginal gain (see file header). `origin ==
 * null` (no GPS) → distance null for all and the list is the route sequence.
 */
export function rankNextCustomers(
  candidates: NextCandidate[],
  origin: GpsPoint | null,
  opts: { limit?: number; weights?: RankWeights } = {},
): RankedCandidate[] {
  const limit = opts.limit ?? 5;
  const stepM = opts.weights?.routeStepMeters ?? DEFAULT_STEP_M;
  const nearM = opts.weights?.nearThresholdMeters ?? DEFAULT_NEAR_M;

  // Remaining route stops in planned order → dense route rank (0,1,2,…).
  const byRoute = candidates.filter(isEligible).slice().sort((a, b) => a.sequence - b.sequence);

  const ranked: RankedCandidate[] = byRoute.map((c, routeRank) => {
    const distanceM =
      origin && c.latitude != null && c.longitude != null
        ? haversineMeters(origin, { lat: c.latitude, lng: c.longitude })
        : null;
    // Route is dominant; distance refines within ~one step. Missing distance
    // contributes 0 so the stop holds its planned (route-rank) position.
    const score = routeRank * stepM + (distanceM ?? 0);
    return { ...c, distanceM, routeRank, score };
  });

  const ordered = ranked.slice().sort((a, b) => (a.score !== b.score ? a.score - b.score : a.sequence - b.sequence));

  // Route-chaos guard: if the next planned stop is within the near threshold,
  // it is always first — no reordering for a non-meaningful saving.
  const anchor = ranked.find((r) => r.routeRank === 0);
  if (anchor && anchor.distanceM != null && anchor.distanceM <= nearM && ordered[0] !== anchor) {
    return [anchor, ...ordered.filter((r) => r !== anchor)].slice(0, Math.max(0, limit));
  }
  return ordered.slice(0, Math.max(0, limit));
}

/** The single best next customer — the Start-Day recommendation (route-first). */
export function nextPlanned(candidates: NextCandidate[], origin: GpsPoint | null): RankedCandidate | null {
  return rankNextCustomers(candidates, origin, { limit: 1 })[0] ?? null;
}

/** Compact, locale-aware distance label. */
export function formatDistance(m: number | null, locale: 'ar' | 'en'): string {
  if (m == null) return '—';
  if (m < 1000) return `${Math.round(m)} ${locale === 'ar' ? 'م' : 'm'}`;
  return `${(m / 1000).toFixed(1)} ${locale === 'ar' ? 'كم' : 'km'}`;
}

