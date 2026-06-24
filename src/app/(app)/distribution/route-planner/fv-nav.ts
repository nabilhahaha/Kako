// Field Verification — navigation action. Google Maps only (per product decision): the
// universal `maps/dir/?api=1` link opens the Google Maps app when installed, else the web.
// Navigation is NEVER radius-gated; submit stays radius/photo gated elsewhere.

import { buildNavUrl, isValidLatLng } from './fv-map-helpers';

/** True when a customer has usable coordinates to navigate to. */
export function canNavigate(lat: number | null | undefined, lng: number | null | undefined): boolean {
  return typeof lat === 'number' && typeof lng === 'number' && isValidLatLng(lat, lng);
}

/** Open Google Maps directions to the given coordinates in a new tab/app. No-op server-side. */
export function openGoogleMapsNavigation(lat: number, lng: number): void {
  if (typeof window === 'undefined') return;
  window.open(buildNavUrl(lat, lng, 'google'), '_blank', 'noopener');
}
