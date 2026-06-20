// ============================================================================
// Route Planner — persisted dataset helpers (pure, no I/O). Shared by the dataset
// server actions (Wave B). Keeps the validation / bbox / column-split logic testable
// and identical across Manual Upload and every connector.
// ============================================================================

/** Columns promoted to their own DB column; everything else rides in `attrs`. */
export const DATASET_KNOWN_KEYS = ['code', 'name', 'lat', 'lng', 'salesman', 'route', 'channel', 'class', 'city', 'area', 'region'] as const;

export interface DatasetCustomerLike {
  code?: string | null; name?: string | null; lat?: number | null; lng?: number | null;
  salesman?: string | null; route?: string | null; channel?: string | null; class?: string | null;
  city?: string | null; area?: string | null; region?: string | null;
  [k: string]: unknown;
}

export interface Bbox { minLat: number; minLng: number; maxLat: number; maxLng: number }

/** A row is valid (plannable) when it has a name and finite, non-(0,0) coordinates. */
export function isValidDatasetCustomer(c: DatasetCustomerLike): boolean {
  return Boolean(
    c.name &&
    typeof c.lat === 'number' && Number.isFinite(c.lat) &&
    typeof c.lng === 'number' && Number.isFinite(c.lng) &&
    !(c.lat === 0 && c.lng === 0),
  );
}

/** Bounding box over the valid-geo rows, or null when none have coordinates. */
export function datasetBbox(rows: readonly DatasetCustomerLike[]): Bbox | null {
  let minLat = Infinity, minLng = Infinity, maxLat = -Infinity, maxLng = -Infinity, n = 0;
  for (const c of rows) {
    if (typeof c.lat !== 'number' || typeof c.lng !== 'number' || !Number.isFinite(c.lat) || !Number.isFinite(c.lng) || (c.lat === 0 && c.lng === 0)) continue;
    if (c.lat < minLat) minLat = c.lat; if (c.lat > maxLat) maxLat = c.lat;
    if (c.lng < minLng) minLng = c.lng; if (c.lng > maxLng) maxLng = c.lng;
    n++;
  }
  return n ? { minLat, minLng, maxLat, maxLng } : null;
}

/** Split an input customer into the known DB columns + the `attrs` long tail.
 *  Empty / null values are dropped from attrs so the JSON stays minimal. */
export function splitDatasetColumns(c: DatasetCustomerLike): { columns: Record<string, unknown>; attrs: Record<string, unknown> } {
  const columns: Record<string, unknown> = {};
  const attrs: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(c)) {
    if ((DATASET_KNOWN_KEYS as readonly string[]).includes(k)) columns[k] = v ?? null;
    else if (v != null && v !== '') attrs[k] = v;
  }
  return { columns, attrs };
}

/** Count valid rows in a working set. */
export function countValid(rows: readonly DatasetCustomerLike[]): number {
  let n = 0; for (const c of rows) if (isValidDatasetCustomer(c)) n++; return n;
}
