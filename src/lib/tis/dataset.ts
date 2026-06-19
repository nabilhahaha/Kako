/**
 * Territory Intelligence Studio — canonical dataset model (TIS-0-1). Pure, no I/O.
 *
 * ONE customer/dataset shape that every TIS stage (Audit · Sizing · Optimization ·
 * Visual Planning · Geo) reads and writes, assembled from existing engines:
 * frequency/workload (FR resolver), coverage (Coverage Engine), outlet grade, geo.
 * Every field is optional except identity + presence in the set — a Mode-A upload
 * (geo, maybe sales) and a Mode-C live tenant produce the SAME shape; missing
 * fields downgrade capabilities (TIS-0-2), they never break the model.
 *
 * This is also the Export ≡ Import ≡ Apply single data model (strategy §4a), so a
 * Google Sheet / Excel / connector row maps straight onto a TisCustomer.
 */
import { frequencyToVisitsPerWeek, type VisitFrequency } from '@/lib/route-optimization/visit-frequency';
import type { CoverageStatus } from '@/lib/distribution/coverage-engine';

export interface TisGeo {
  lat: number;
  lng: number;
}

export interface TisOwnership {
  salesmanId: string | null;
  supervisorId: string | null;
  areaId: string | null;
  regionId: string | null;
  routeId: string | null;
}

export interface TisCustomer {
  id: string;
  code: string | null;
  name: string;
  geo: TisGeo | null;
  ownership: TisOwnership;
  /** Outlet grade code (a/b/c/…) — priority signal. */
  grade: string | null;
  /** Visit frequency (FR resolver) — the workload source of truth. */
  frequency: VisitFrequency | null;
  /** Optional commercial weight (from sales history). */
  salesValue: number | null;
  /** Coverage status (Coverage Engine / CJ-3). */
  coverage: CoverageStatus | null;
  /** Optional customer-health score (0–100). */
  health: number | null;
}

export type TisMode = 'A' | 'B' | 'C';
export type TisSource = 'live' | 'upload' | 'sheets' | 'connector';

export interface TisDataset {
  customers: TisCustomer[];
  /** ISO date the snapshot was assembled for. */
  asOf: string;
  source: TisSource;
}

const EMPTY_OWNERSHIP: TisOwnership = {
  salesmanId: null, supervisorId: null, areaId: null, regionId: null, routeId: null,
};

/** True when a geo point is present and numerically valid (lat ∈ [-90,90], lng ∈ [-180,180]). */
export function isValidGeo(geo: TisGeo | null | undefined): geo is TisGeo {
  if (!geo) return false;
  const { lat, lng } = geo;
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && !(lat === 0 && lng === 0);
}

/** Build a normalized TisCustomer from a partial input (identity required). Pure.
 *  Invalid geo is dropped to null; ownership is fully populated with nulls. */
export function buildTisCustomer(
  input: Partial<TisCustomer> & { id: string; name: string },
): TisCustomer {
  return {
    id: input.id,
    code: input.code ?? null,
    name: input.name,
    geo: isValidGeo(input.geo ?? null) ? { lat: input.geo!.lat, lng: input.geo!.lng } : null,
    ownership: { ...EMPTY_OWNERSHIP, ...(input.ownership ?? {}) },
    grade: input.grade ? String(input.grade).toLowerCase() : null,
    frequency: input.frequency ?? null,
    salesValue: typeof input.salesValue === 'number' && Number.isFinite(input.salesValue) ? input.salesValue : null,
    coverage: input.coverage ?? null,
    health: typeof input.health === 'number' && Number.isFinite(input.health) ? input.health : null,
  };
}

/** Compose a dataset from already-built customers + metadata. Pure. */
export function buildTisDataset(
  customers: readonly TisCustomer[],
  meta: { asOf?: string; source?: TisSource } = {},
): TisDataset {
  return {
    customers: [...customers],
    asOf: meta.asOf ?? new Date().toISOString().slice(0, 10),
    source: meta.source ?? 'live',
  };
}

/** Per-customer visit workload (visits/week) from its frequency, or null. Pure —
 *  the single bridge stages use for workload-weighted sizing/optimization. */
export function customerWorkload(c: TisCustomer): number | null {
  return c.frequency ? frequencyToVisitsPerWeek(c.frequency) : null;
}

// ── Presence predicates (drive the TIS-0-2 capability matrix) ────────────────
export const hasGeo = (c: TisCustomer): boolean => isValidGeo(c.geo);
export const hasFrequency = (c: TisCustomer): boolean => c.frequency != null;
export const hasGrade = (c: TisCustomer): boolean => c.grade != null;
export const hasSalesValue = (c: TisCustomer): boolean => c.salesValue != null;
export const hasCoverage = (c: TisCustomer): boolean => c.coverage != null;
export const hasHealth = (c: TisCustomer): boolean => c.health != null;

/** Validate a customer for inclusion; returns issue codes (empty = ok). Pure. */
export function validateTisCustomer(c: TisCustomer): string[] {
  const issues: string[] = [];
  if (!c.id) issues.push('missing_id');
  if (!c.name || !c.name.trim()) issues.push('missing_name');
  if (c.geo && !isValidGeo(c.geo)) issues.push('invalid_geo');
  if (c.health != null && (c.health < 0 || c.health > 100)) issues.push('health_out_of_range');
  return issues;
}

/** Fraction (0–1) of customers for which a predicate holds — feeds capability
 *  thresholds + "needs X" empty states. Pure. */
export function coverageOf(dataset: TisDataset, pred: (c: TisCustomer) => boolean): number {
  const n = dataset.customers.length;
  if (n === 0) return 0;
  let k = 0;
  for (const c of dataset.customers) if (pred(c)) k++;
  return k / n;
}
