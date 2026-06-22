// ============================================================================
// Route Planner — persisted dataset helpers (pure, no I/O). Shared by the dataset
// server actions (Wave B) + the rehydration loaders (Wave D). Keeps validation / bbox /
// column-split / row→model mapping testable and identical across Manual Upload and every
// connector.
// ============================================================================
import { buildTisCustomer, buildTisDataset, type TisCustomer, type TisDataset } from '@/lib/tis/dataset';
import type { DpCustomer } from '@/lib/tis/day-planner-import';

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

// ── Rehydration: persisted dataset rows → the planner's customer models ──────
// A persisted row as returned by getDatasetPage (known columns + attrs long tail).
export interface PersistedRow {
  seq?: number; code?: string | null; name: string; lat?: number | null; lng?: number | null;
  salesman?: string | null; route?: string | null; channel?: string | null; class?: string | null;
  city?: string | null; area?: string | null; region?: string | null; attrs?: Record<string, unknown> | null;
  [k: string]: unknown;
}

const numAttr = (a: Record<string, unknown> | null | undefined, k: string): number | undefined => {
  const v = a?.[k]; return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
};
const strAttr = (a: Record<string, unknown> | null | undefined, k: string): string | null => {
  const v = a?.[k]; return v == null || v === '' ? null : String(v);
};

/**
 * Map persisted rows → DpCustomer[] (Day Planner / Customers / Territories / Journey seed).
 * Keeps only plannable rows (name + finite coords). Pure; mirrors the upload→seed shape.
 */
export function datasetRowsToDpCustomers(rows: readonly PersistedRow[]): DpCustomer[] {
  const out: DpCustomer[] = [];
  rows.forEach((r, i) => {
    if (!isValidDatasetCustomer(r)) return;
    out.push({
      id: r.code || `ds-${r.seq ?? i}`, code: r.code ?? null, name: r.name, lat: r.lat as number, lng: r.lng as number,
      salesman: r.salesman ?? null, channel: r.channel ?? null, class: r.class ?? null,
      city: r.city ?? null, area: r.area ?? null, region: r.region ?? null,
      supervisor: strAttr(r.attrs, 'supervisor'), phone: strAttr(r.attrs, 'phone'), address: strAttr(r.attrs, 'address'),
      sales: numAttr(r.attrs, 'sales'),
    });
  });
  return out;
}

/**
 * Map persisted rows → a canonical TisDataset for Route Builder (reuses buildTisCustomer
 * so the shape is identical to an upload). Pure.
 */
export function datasetRowsToTisDataset(rows: readonly PersistedRow[], asOf?: string): TisDataset {
  const customers = rows.map((r, i) => buildTisCustomer({
    id: r.code || `ds-${r.seq ?? i}`, code: r.code ?? null, name: r.name,
    geo: (typeof r.lat === 'number' && typeof r.lng === 'number') ? { lat: r.lat, lng: r.lng } : null,
    ownership: { salesmanId: r.salesman ?? null, supervisorId: strAttr(r.attrs, 'supervisor'), areaId: r.area ?? null, regionId: r.region ?? null, routeId: r.route ?? null },
    grade: r.class ?? null, channel: r.channel ?? null, city: r.city ?? null,
    salesValue: numAttr(r.attrs, 'sales') ?? null,
  }));
  return buildTisDataset(customers, { source: 'connector', asOf });
}

/** Convert the planner's in-memory TisCustomers into persistable dataset rows so a working
 *  set built/edited in the planner can be saved (persistDataset). Inverse of
 *  datasetRowsToTisDataset. Pure; rows without a name are dropped. */
export function tisCustomersToDatasetInput(
  customers: readonly TisCustomer[],
): (DatasetCustomerLike & { name: string })[] {
  return customers
    .filter((c): c is TisCustomer => Boolean(c && c.name))
    .map((c) => ({
      code: c.code ?? null,
      name: c.name,
      lat: c.geo?.lat ?? null,
      lng: c.geo?.lng ?? null,
      salesman: c.ownership?.salesmanId ?? null,
      route: c.ownership?.routeId ?? null,
      channel: c.channel ?? null,
      class: c.grade ?? null,
      city: c.city ?? null,
      area: c.ownership?.areaId ?? null,
      region: c.ownership?.regionId ?? null,
    }));
}
