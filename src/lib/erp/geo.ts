/** Client-safe geodesy. Mirrors the SQL erp_fe_distance_m so the rep UI can show
 *  the geofence distance live (before sync) and the server can re-validate. */

export function haversineMeters(lat1: number | null, lng1: number | null, lat2: number | null, lng2: number | null): number | null {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null;
  if ([lat1, lng1, lat2, lng2].some((v) => Number.isNaN(v))) return null;
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)) * 10) / 10;
}

export type GeofenceStatus = 'ok' | 'violation' | 'unknown';

export function geofenceStatus(distanceM: number | null, radiusM: number): GeofenceStatus {
  if (distanceM == null) return 'unknown';
  return distanceM <= radiusM ? 'ok' : 'violation';
}

/** Whether an out-of-geofence check-in needs an exception photo, mirroring the
 *  server rule: blocking mode always, advisory only beyond the photo threshold. */
export function needsExceptionPhoto(status: GeofenceStatus, distanceM: number | null, mode: 'advisory' | 'blocking', photoThresholdM: number): boolean {
  if (status !== 'violation') return false;
  return mode === 'blocking' || (distanceM != null && distanceM > photoThresholdM);
}
