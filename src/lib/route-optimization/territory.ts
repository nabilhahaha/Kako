// ============================================================================
// Route Optimization — territory management (Phase 3 FMCG). Pure. City-based,
// area-based, or GPS-polygon-based territories with membership resolution +
// split/merge planning. Polygon test = ray casting. No I/O.
// ============================================================================

export type TerritoryKind = 'city' | 'area' | 'polygon';

export interface GeoPoint { latitude: number; longitude: number }

export interface Territory {
  id: string;
  kind: TerritoryKind;
  cities?: string[];        // for kind='city'
  areaIds?: string[];       // for kind='area'
  polygon?: GeoPoint[];     // for kind='polygon' (closed ring)
}

export interface TerritoryCustomer {
  customerId: string;
  city?: string | null;
  areaId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

/** Ray-casting point-in-polygon. Pure. */
export function pointInPolygon(p: GeoPoint, polygon: readonly GeoPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    const intersect = (a.latitude > p.latitude) !== (b.latitude > p.latitude) &&
      p.longitude < ((b.longitude - a.longitude) * (p.latitude - a.latitude)) / (b.latitude - a.latitude) + a.longitude;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** True when a customer belongs to a territory (by its kind). Pure. */
export function customerInTerritory(c: TerritoryCustomer, t: Territory): boolean {
  if (t.kind === 'city') return c.city != null && (t.cities ?? []).includes(c.city);
  if (t.kind === 'area') return c.areaId != null && (t.areaIds ?? []).includes(c.areaId);
  if (t.kind === 'polygon') return c.latitude != null && c.longitude != null && !!t.polygon &&
    pointInPolygon({ latitude: c.latitude, longitude: c.longitude }, t.polygon);
  return false;
}

/** Assign customers to the first matching territory. Pure. */
export function assignTerritories(
  customers: readonly TerritoryCustomer[],
  territories: readonly Territory[],
): { customerId: string; territoryId: string | null }[] {
  return customers.map((c) => ({ customerId: c.customerId, territoryId: territories.find((t) => customerInTerritory(c, t))?.id ?? null }));
}

/**
 * Plan a split: partition a territory's customers into `parts` balanced buckets
 * (round-robin by descending weight). Returns customerId → bucket index. Pure.
 */
export function planTerritorySplit(
  customers: readonly { customerId: string; weight?: number }[],
  parts: number,
): { customerId: string; bucket: number }[] {
  if (parts <= 1) return customers.map((c) => ({ customerId: c.customerId, bucket: 0 }));
  const sorted = [...customers].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
  const loads = new Array(parts).fill(0);
  const out: { customerId: string; bucket: number }[] = [];
  for (const c of sorted) {
    let b = 0;
    for (let i = 1; i < parts; i++) if (loads[i] < loads[b]) b = i;   // least-loaded bucket
    loads[b] += c.weight ?? 1;
    out.push({ customerId: c.customerId, bucket: b });
  }
  return out;
}

/** Plan a merge: reassign all members of `fromIds` to `toId`. Pure. */
export function planTerritoryMerge(
  members: readonly { customerId: string; territoryId: string }[],
  fromIds: readonly string[],
  toId: string,
): { customerId: string; territoryId: string }[] {
  return members
    .filter((m) => fromIds.includes(m.territoryId))
    .map((m) => ({ customerId: m.customerId, territoryId: toId }));
}
