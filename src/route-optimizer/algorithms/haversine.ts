/**
 * Haversine distance calculations for geographic coordinates.
 * All distances returned in kilometers.
 */

const EARTH_RADIUS_KM = 6371;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * Compute the great-circle distance between two points on Earth.
 * Uses the Haversine formula.
 *
 * @returns distance in kilometers
 */
export function haversine(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const rLat1 = toRad(lat1);
  const rLat2 = toRad(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c;
}

/**
 * Build a symmetric distance matrix for a set of points.
 * Uses a flat Float64Array for cache-friendly access on large sets.
 *
 * @returns flat distance matrix of size n*n (access: matrix[i * n + j])
 */
export function buildDistanceMatrix(
  points: ReadonlyArray<{ lat: number; lng: number }>,
): Float64Array {
  const n = points.length;
  const matrix = new Float64Array(n * n);

  for (let i = 0; i < n; i++) {
    const pi = points[i];
    for (let j = i + 1; j < n; j++) {
      const d = haversine(pi.lat, pi.lng, points[j].lat, points[j].lng);
      matrix[i * n + j] = d;
      matrix[j * n + i] = d;
    }
    // matrix[i * n + i] = 0; already zero-initialized
  }

  return matrix;
}

/**
 * Sum of consecutive Haversine distances along an ordered path.
 */
export function totalPathDistance(
  points: ReadonlyArray<{ lat: number; lng: number }>,
): number {
  if (points.length < 2) return 0;

  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += haversine(points[i].lat, points[i].lng, points[i + 1].lat, points[i + 1].lng);
  }
  return total;
}

/**
 * Round-trip distance: depot -> points in order -> depot.
 */
export function roundTripDistance(
  depot: { lat: number; lng: number },
  points: ReadonlyArray<{ lat: number; lng: number }>,
): number {
  if (points.length === 0) return 0;

  let total = haversine(depot.lat, depot.lng, points[0].lat, points[0].lng);

  for (let i = 0; i < points.length - 1; i++) {
    total += haversine(points[i].lat, points[i].lng, points[i + 1].lat, points[i + 1].lng);
  }

  total += haversine(
    points[points.length - 1].lat,
    points[points.length - 1].lng,
    depot.lat,
    depot.lng,
  );

  return total;
}
