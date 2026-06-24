// Field Verification — Map tab pure helpers (no I/O / no React) so the marker status,
// colour, navigation deep-link and GeoJSON shaping are unit-tested. The map component
// (fv-map.tsx) and the data action (getMyMapCustomers) consume these.

export type FvMapStatus = 'completed' | 'pending';

/** One mappable customer assigned to the logged-in rep. */
export interface FvMapPoint {
  id: string;
  code: string | null;
  name: string;
  lat: number;
  lng: number;
  city: string | null;
  channel: string | null;
  /** Already verified by this rep → a green marker; otherwise pending → red. */
  completed: boolean;
  /** ISO timestamp of the rep's verification when completed, else null. */
  lastVerifiedAt: string | null;
}

export function mapStatus(p: { completed: boolean }): FvMapStatus {
  return p.completed ? 'completed' : 'pending';
}

/** Marker colours: green = completed/verified, red = pending/not verified. */
export const FV_MARKER_COLOR: Record<FvMapStatus, string> = {
  completed: '#16a34a', // green-600
  pending: '#dc2626', // red-600
};

export function markerColor(p: { completed: boolean }): string {
  return FV_MARKER_COLOR[mapStatus(p)];
}

/** True for a coordinate that is finite and within real lat/lng bounds (and not 0,0). */
export function isValidLatLng(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) && Number.isFinite(lng) &&
    Math.abs(lat) <= 90 && Math.abs(lng) <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

/**
 * A maps deep-link for turn-by-turn navigation to a customer's coordinates.
 *  - 'google' (default): universal link that opens the Google Maps app on Android/iOS and
 *    the web elsewhere.
 *  - 'apple': Apple Maps (iOS/macOS).
 * Navigation is NEVER radius-gated — it works for any customer regardless of distance.
 */
export function buildNavUrl(lat: number, lng: number, platform: 'google' | 'apple' = 'google'): string {
  if (platform === 'apple') return `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`;
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

/** GeoJSON FeatureCollection for a MapLibre clustered source. Drops invalid coordinates. */
export function toMapGeoJSON(points: FvMapPoint[]) {
  return {
    type: 'FeatureCollection' as const,
    features: points
      .filter((p) => isValidLatLng(p.lat, p.lng))
      .map((p) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] as [number, number] },
        properties: { id: p.id, status: mapStatus(p), color: markerColor(p) },
      })),
  };
}

/** Legend counts for the map header. */
export function mapCounts(points: { completed: boolean }[]): { total: number; completed: number; pending: number } {
  let completed = 0;
  for (const p of points) if (p.completed) completed += 1;
  return { total: points.length, completed, pending: points.length - completed };
}
