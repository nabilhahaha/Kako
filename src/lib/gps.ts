export function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

export function isWithinRadius(
  userLat: number, userLon: number,
  customerLat: number, customerLon: number,
  radiusMeters: number,
): { within: boolean; distance: number } {
  const distance = Math.round(haversineDistance(userLat, userLon, customerLat, customerLon));
  return { within: distance <= radiusMeters, distance };
}

export function mockCurrentLocation(customerLat: number, customerLon: number, withinRadius: boolean): { lat: number; lng: number } {
  if (withinRadius) {
    const offset = (Math.random() * 0.0005) - 0.00025;
    return { lat: customerLat + offset, lng: customerLon + offset };
  }
  const offset = (Math.random() * 0.01) + 0.005;
  return { lat: customerLat + offset, lng: customerLon + offset };
}
