import type { Customer } from '@/types'

export interface LatLng {
  latitude: number
  longitude: number
}

const EARTH_RADIUS_M = 6371000

/** Great-circle distance in metres between two coordinates (Haversine). */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.latitude - a.latitude)
  const dLng = toRad(b.longitude - a.longitude)
  const lat1 = toRad(a.latitude)
  const lat2 = toRad(b.latitude)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}

/** "350 m", "1.2 km", "24 km" — compact human distance. */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`
  if (meters < 10000) return `${(meters / 1000).toFixed(1)} km`
  return `${Math.round(meters / 1000)} km`
}

/**
 * Rough driving time from straight-line distance. Applies a 1.35 road factor
 * and a 32 km/h average urban speed — good enough for an at-a-glance estimate
 * without a routing API.
 */
export function estimateDriveMinutes(meters: number): number {
  const roadMeters = meters * 1.35
  const avgSpeedKmh = 32
  const minutes = (roadMeters / 1000 / avgSpeedKmh) * 60
  return Math.max(1, Math.round(minutes))
}

export function formatDriveTime(meters: number): string {
  const minutes = estimateDriveMinutes(meters)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`
}

export function hasCoords(
  customer: Pick<Customer, 'latitude' | 'longitude'>,
): customer is Customer & { latitude: number; longitude: number } {
  return customer.latitude != null && customer.longitude != null
}

// ------------------------------------------------------------- navigation

/**
 * Universal Google Maps directions link. Opens the Google Maps app when it's
 * installed on iPhone/Android and falls back to Google Maps in the browser
 * otherwise, with turn-by-turn driving navigation to the coordinate.
 */
export function googleMapsDirUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`
}

/**
 * Multi-stop Google Maps directions. Origin is optional (defaults to the
 * device's current location); intermediate stops become waypoints.
 */
export function googleMapsRouteUrl(stops: LatLng[], origin?: LatLng): string {
  if (stops.length === 0) return 'https://www.google.com/maps'
  const destination = stops[stops.length - 1]
  const waypoints = stops.slice(0, -1)
  const params = new URLSearchParams({ api: '1' })
  if (origin) params.set('origin', `${origin.latitude},${origin.longitude}`)
  params.set('destination', `${destination.latitude},${destination.longitude}`)
  if (waypoints.length > 0) {
    params.set('waypoints', waypoints.map((w) => `${w.latitude},${w.longitude}`).join('|'))
  }
  params.set('travelmode', 'driving')
  return `https://www.google.com/maps/dir/?${params.toString()}`
}

export function appleMapsDirUrl(lat: number, lng: number): string {
  return `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS 13+ reports as Mac; detect touch to disambiguate.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

export function openExternal(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer')
}

/** Nearest N customers to `from`, each annotated with its distance (metres). */
export function nearestCustomers<T extends LatLng>(
  from: LatLng,
  items: T[],
  limit: number,
): { item: T; meters: number }[] {
  return items
    .map((item) => ({ item, meters: distanceMeters(from, item) }))
    .sort((a, b) => a.meters - b.meters)
    .slice(0, limit)
}
