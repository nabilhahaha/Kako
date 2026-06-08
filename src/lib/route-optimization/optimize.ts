// ============================================================================
// Route Optimization — sequencing engine (Phase 3 FMCG). Pure. REUSES the
// existing journey-sort (nearest-neighbour tour + haversine) over existing
// customer GPS — no rebuild — and adds total-travel + backtracking metrics so a
// route can be scored, compared, and improved. Minimizes dead mileage.
// ============================================================================

import { distanceMeters, sortJourney, type JourneyStop, type JourneySortMode, type LatLng } from '@/lib/erp/journey-sort';

export interface OptimizeCustomer {
  customerId: string;
  latitude: number | null;
  longitude: number | null;
  sequence?: number;
  priority?: number;       // higher = visit earlier (tie-break)
}

export interface OptimizedRoute {
  order: { customerId: string; order: number }[];
  totalDistanceM: number;
  backtrackingM: number;   // travel that moves away then back (proxy: sum over the straight-line lower bound)
  stopCount: number;
  mode: JourneySortMode;
}

/** Total point-to-point travel along an ordered list (from optional origin). Pure. */
export function totalTravel(stops: readonly { latitude: number | null; longitude: number | null }[], origin: LatLng | null = null): number {
  let total = 0;
  let cursor: LatLng | null = origin;
  for (const s of stops) {
    if (cursor && s.latitude != null && s.longitude != null) {
      const d = distanceMeters(cursor, s);
      if (Number.isFinite(d)) total += d;
    }
    if (s.latitude != null && s.longitude != null) cursor = { latitude: s.latitude, longitude: s.longitude };
  }
  return total;
}

/**
 * Optimize a route's visit sequence. Default 'optimized' (nearest-neighbour);
 * 'manual'/'nearest'/'hybrid' also supported via journey-sort. Reports total
 * travel + a backtracking proxy (optimized travel vs the direct-distance lower
 * bound from origin to the farthest stop). Pure.
 */
export function optimizeRoute(
  customers: readonly OptimizeCustomer[],
  origin: LatLng | null = null,
  mode: JourneySortMode = 'optimized',
): OptimizedRoute {
  const stops: JourneyStop[] = customers.map((c, i) => ({
    customerId: c.customerId,
    sequence: c.sequence ?? (c.priority != null ? -c.priority : i + 1),
    latitude: c.latitude,
    longitude: c.longitude,
  }));
  const ordered = sortJourney(stops, mode, origin);
  const totalDistanceM = totalTravel(ordered, origin);
  // Backtracking proxy: optimized travel minus the lower-bound (origin→farthest).
  const ref = origin ?? (ordered.find((s) => s.latitude != null) ? { latitude: ordered.find((s) => s.latitude != null)!.latitude as number, longitude: ordered.find((s) => s.latitude != null)!.longitude as number } : null);
  const lowerBound = ordered.reduce((m, s) => {
    const d = distanceMeters(ref, s);
    return Number.isFinite(d) ? Math.max(m, d) : m;
  }, 0);
  return {
    order: ordered.map((s, i) => ({ customerId: s.customerId, order: i + 1 })),
    totalDistanceM,
    backtrackingM: Math.max(0, totalDistanceM - lowerBound),
    stopCount: ordered.length,
    mode,
  };
}
