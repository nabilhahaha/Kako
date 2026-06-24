// Field Verification — Coverage Map: pure helpers + types (no I/O / no React) so the coverage
// status, counters and GeoJSON marker conversion are unit-tested and reused by the action +
// the Coverage Map page (PR 2). Photo IDs only here — signed URLs are resolved lazily in the UI.

import { isValidLatLng } from './fv-map-helpers';

export type CoverageStatus = 'visited' | 'pending';

/** One in-scope customer + its verification status, returned by erp_fv_coverage / getFvCoverage. */
export interface CoverageRow {
  customerId: string;
  code: string | null;
  name: string;
  city: string | null;
  area: string | null;
  channel: string | null;
  salesman: string | null;        // assigned rep email
  assignedRep: string | null;     // resolved rep name (or null → fall back to email in UI)
  lat: number | null;
  lng: number | null;
  datasetId: string | null;
  datasetName: string | null;
  datasetStatus: string | null;   // active | archived
  visited: boolean;               // verified within the selected range (or ever, if no range)
  verifiedAt: string | null;
  distanceM: number | null;
  allowedRadiusM: number | null;
  radiusEnforced: boolean | null;
  outsidePhotoId: string | null;
  insidePhotoIds: string[];
  notes: string | null;
}

/** Server-side filters for the coverage query. */
export interface CoverageFilters {
  from?: string | null;           // ISO; visited = verified_at in [from,to]
  to?: string | null;
  salesman?: string | null;       // rep email; null = all
  status?: CoverageStatus | null; // null = all
  datasetId?: string | null;      // null = all
  includeArchived?: boolean;      // default false
  search?: string | null;         // code/name/city/channel
  limit?: number;
}

export function coverageStatus(r: { visited: boolean }): CoverageStatus {
  return r.visited ? 'visited' : 'pending';
}

/** Marker colours: green = visited/completed, red = not visited/pending. */
export const COVERAGE_COLOR: Record<CoverageStatus, string> = { visited: '#16a34a', pending: '#dc2626' };

export function coverageColor(r: { visited: boolean }): string {
  return COVERAGE_COLOR[coverageStatus(r)];
}

export interface CoverageCounters {
  total: number;
  visited: number;
  pending: number;
  coveragePct: number;
  photos: number;   // rows that captured at least one photo
}

export function coverageCounters(rows: CoverageRow[]): CoverageCounters {
  let visited = 0;
  let photos = 0;
  for (const r of rows) {
    if (r.visited) visited += 1;
    if (r.outsidePhotoId || r.insidePhotoIds.length > 0) photos += 1;
  }
  const total = rows.length;
  return { total, visited, pending: total - visited, coveragePct: total > 0 ? Math.round((visited / total) * 100) : 0, photos };
}

/** GeoJSON for the map marker layer — green/red dot per customer; drops invalid coords. The
 *  full payload is embedded so a marker tap can open the detail panel without a re-lookup. */
export function coverageGeoJSON(rows: CoverageRow[]) {
  return {
    type: 'FeatureCollection' as const,
    features: rows
      .filter((r) => isValidLatLng(r.lat as number, r.lng as number))
      .map((r) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [r.lng as number, r.lat as number] as [number, number] },
        properties: { id: r.customerId, status: coverageStatus(r), color: coverageColor(r) },
      })),
  };
}

/** Attachment ids a visited row can show (outside + inside), dropping blanks. */
export function coveragePhotoIds(r: { outsidePhotoId?: string | null; insidePhotoIds?: readonly (string | null)[] | null }): string[] {
  return [r.outsidePhotoId, ...(r.insidePhotoIds ?? [])].filter((x): x is string => typeof x === 'string' && x.length > 0);
}
