// ============================================================================
// Route Optimization — map provider deep links (Phase 3 FMCG). Pure. No vendor
// lock-in: provider is a parameter (Google / Apple / Waze, extensible). Generates
// navigate-to-next, open-route, and route-summary URLs from existing GPS.
// ============================================================================

import type { LatLng } from '@/lib/erp/journey-sort';

export type MapProvider = 'google' | 'apple' | 'waze';
export const MAP_PROVIDERS: readonly MapProvider[] = ['google', 'apple', 'waze'];

const ll = (p: LatLng): string => `${p.latitude},${p.longitude}`;

/** Turn-by-turn navigation URL to a destination (optional origin). Pure. */
export function navigationUrl(provider: MapProvider, dest: LatLng, origin?: LatLng | null): string {
  switch (provider) {
    case 'waze':
      return `https://waze.com/ul?ll=${ll(dest)}&navigate=yes`;
    case 'apple':
      return `https://maps.apple.com/?daddr=${ll(dest)}${origin ? `&saddr=${ll(origin)}` : ''}&dirflg=d`;
    case 'google':
    default:
      return `https://www.google.com/maps/dir/?api=1&destination=${ll(dest)}${origin ? `&origin=${ll(origin)}` : ''}&travelmode=driving`;
  }
}

/** Multi-stop route URL (origin → waypoints → last). Waze supports only a single
 *  destination, so it routes to the final stop. Pure. */
export function openRouteUrl(provider: MapProvider, waypoints: readonly LatLng[]): string {
  if (waypoints.length === 0) return '';
  if (provider === 'waze') return navigationUrl('waze', waypoints[waypoints.length - 1]);
  if (provider === 'apple') return navigationUrl('apple', waypoints[waypoints.length - 1], waypoints[0]);
  const origin = waypoints[0];
  const destination = waypoints[waypoints.length - 1];
  const mid = waypoints.slice(1, -1).map(ll).join('|');
  return `https://www.google.com/maps/dir/?api=1&origin=${ll(origin)}&destination=${ll(destination)}${mid ? `&waypoints=${mid}` : ''}&travelmode=driving`;
}
