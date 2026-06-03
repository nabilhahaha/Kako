/**
 * FMCG Journey — stop ordering (the "Today's Journey" sort modes).
 *
 * Pure + deterministic so it runs on the rep's device and in tests. The DB
 * (erp_today_journey) returns the planned stops with their manual `sequence` and
 * GPS; this module orders them for display by the company's chosen sort mode.
 */

export type JourneySortMode = 'manual' | 'nearest' | 'optimized' | 'hybrid';

export interface JourneyStop {
  customerId: string;
  sequence: number;
  latitude: number | null;
  longitude: number | null;
}

export interface LatLng {
  latitude: number;
  longitude: number;
}

/** Haversine distance in metres; Infinity when either point lacks coordinates so
 *  GPS-less stops sort last under proximity modes (never crash). */
export function distanceMeters(a: LatLng | null, b: { latitude: number | null; longitude: number | null } | null): number {
  if (!a || !b || b.latitude == null || b.longitude == null) return Infinity;
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

function hasGps(s: JourneyStop): boolean {
  return s.latitude != null && s.longitude != null;
}

/** Manual: by sequence then customerId (stable, deterministic). */
function byManual(stops: JourneyStop[]): JourneyStop[] {
  return [...stops].sort((a, b) => a.sequence - b.sequence || a.customerId.localeCompare(b.customerId));
}

/** Greedy nearest-neighbour tour from an origin (the rep's current location, or
 *  the first manual stop when no origin is given). GPS-less stops are appended in
 *  manual order. */
function nearestNeighbourTour(stops: JourneyStop[], origin: LatLng | null): JourneyStop[] {
  const withGps = stops.filter(hasGps);
  const without = byManual(stops.filter((s) => !hasGps(s)));
  if (withGps.length === 0) return without;

  const remaining = [...withGps];
  const out: JourneyStop[] = [];
  let cursor: LatLng | null =
    origin ?? { latitude: withGps[0].latitude as number, longitude: withGps[0].longitude as number };

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = distanceMeters(cursor, remaining[i]);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    const [next] = remaining.splice(bestIdx, 1);
    out.push(next);
    cursor = { latitude: next.latitude as number, longitude: next.longitude as number };
  }
  return [...out, ...without];
}

/** Order the day's stops by the chosen mode.
 *  - manual    : the planned sequence.
 *  - nearest   : closest-first from the origin (simple distance sort).
 *  - optimized : greedy nearest-neighbour tour (shorter total travel).
 *  - hybrid    : keep sequenced stops (sequence > 0) in manual order, then append
 *                the unsequenced ones as an optimized tail. */
export function sortJourney(
  stops: JourneyStop[],
  mode: JourneySortMode,
  origin: LatLng | null = null,
): JourneyStop[] {
  switch (mode) {
    case 'manual':
      return byManual(stops);
    case 'nearest': {
      const ref =
        origin ?? (stops.find(hasGps) ? { latitude: stops.find(hasGps)!.latitude as number, longitude: stops.find(hasGps)!.longitude as number } : null);
      const withGps = stops.filter(hasGps).sort((a, b) => distanceMeters(ref, a) - distanceMeters(ref, b));
      const without = byManual(stops.filter((s) => !hasGps(s)));
      return [...withGps, ...without];
    }
    case 'optimized':
      return nearestNeighbourTour(stops, origin);
    case 'hybrid': {
      const sequenced = byManual(stops.filter((s) => s.sequence > 0));
      const unsequenced = nearestNeighbourTour(stops.filter((s) => s.sequence <= 0), origin);
      return [...sequenced, ...unsequenced];
    }
    default:
      return byManual(stops);
  }
}
