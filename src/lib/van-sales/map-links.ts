// External turn-by-turn navigation deep links (pure). Each opens the device's
// map app to navigate to the destination. Google Maps + Apple Maps work on all
// platforms via universal URLs; Waze is offered too (its app handles the link
// when installed, else the web fallback). Caller decides which to surface.

export type MapProvider = 'google' | 'apple' | 'waze';

/** Google Maps directions (universal URL — opens the app on mobile, web else). */
export function googleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

/** Apple Maps directions. */
export function appleMapsUrl(lat: number, lng: number): string {
  return `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`;
}

/** Waze navigation (opens the app when installed, else waze.com). */
export function wazeUrl(lat: number, lng: number): string {
  return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
}

export function mapUrl(provider: MapProvider, lat: number, lng: number): string {
  switch (provider) {
    case 'apple':
      return appleMapsUrl(lat, lng);
    case 'waze':
      return wazeUrl(lat, lng);
    case 'google':
    default:
      return googleMapsUrl(lat, lng);
  }
}

/** Valid finite coordinates required before offering navigation. */
export function hasValidCoords(lat: number | null | undefined, lng: number | null | undefined): boolean {
  return (
    typeof lat === 'number' && typeof lng === 'number' &&
    Number.isFinite(lat) && Number.isFinite(lng) &&
    Math.abs(lat) <= 90 && Math.abs(lng) <= 180 &&
    !(lat === 0 && lng === 0)
  );
}
