// ============================================================================
// Pure geodesic helpers for Field Customer Verification. Used by BOTH the rep mobile
// UI (nearby filter) and — authoritatively — the server action (50 m proximity lock), so
// the distance check is enforced server-side, not only in the UI.
// ============================================================================

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres between two WGS84 points (haversine). */
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** The proximity lock radius for opening/verifying a customer. */
export const NEARBY_RADIUS_M = 50;

/** Within the lock radius (default 50 m)? */
export function isWithinRadius(meters: number, radius: number = NEARBY_RADIUS_M): boolean {
  return Number.isFinite(meters) && meters <= radius;
}

/** A finite, on-earth, non-null-island coordinate. */
export function validCoord(lat?: number | null, lng?: number | null): lat is number {
  return typeof lat === 'number' && typeof lng === 'number'
    && Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
    && !(lat === 0 && lng === 0);
}
