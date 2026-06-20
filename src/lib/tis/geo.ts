/**
 * Geo Intelligence — geo-feature read-model (GEO-1). Pure, no I/O, no map library.
 * Turns the TIS-0 dataset + Territory Audit into provider-agnostic map layers
 * (points + category + colour + optional weight + legend). The renderer (GEO-2)
 * draws these; the same features also feed export and any future map tech, so the
 * map-technology choice is never locked into the data. Reused by Route
 * Optimization, Visual Planning, and Sales Force Sizing.
 */
import type { CoverageStatus } from '@/lib/distribution/coverage-engine';
import { resolveCapabilities } from './capabilities';
import { isValidGeo, type TisCustomer, type TisDataset } from './dataset';
import type { TerritoryAudit } from './audit';

export type GeoLayerId = 'customers' | 'coverage' | 'ownership' | 'whitespace' | 'imbalance';

export interface GeoFeature {
  id: string;
  lat: number;
  lng: number;
  name: string;
  /** Layer-specific category key (status / salesman id / region id / flag). */
  category: string;
  /** Resolved hex colour for the renderer. */
  color: string;
  /** Optional weight (sales / workload) for sizing or future heat. */
  value?: number;
}

export interface GeoLegendItem { category: string; label: string; color: string }

export interface GeoLayer {
  id: GeoLayerId;
  available: boolean;
  features: GeoFeature[];
  legend: GeoLegendItem[];
}

// ── Palettes (hex; renderer-agnostic) ────────────────────────────────────────
const NEUTRAL = '#64748b';
const COVERAGE_COLORS: Record<CoverageStatus, string> = {
  on_track: '#16a34a',
  under_covered: '#d97706',
  over_covered: '#2563eb',
  never_visited: '#dc2626',
};
const GRADE_COLORS: Record<string, string> = { a: '#16a34a', b: '#2563eb', c: '#d97706', d: '#dc2626' };
/** Categorical palette for ownership / territory (hashed by key). */
const CATEGORICAL = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#ea580c', '#4f46e5'];

function hashColor(key: string): string {
  if (!key) return NEUTRAL;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return CATEGORICAL[Math.abs(h) % CATEGORICAL.length];
}

const geoCustomers = (dataset: TisDataset): TisCustomer[] => dataset.customers.filter((c) => isValidGeo(c.geo));
const baseFeature = (c: TisCustomer): Omit<GeoFeature, 'category' | 'color'> => ({ id: c.id, lat: c.geo!.lat, lng: c.geo!.lng, name: c.name });

/**
 * Build all geo layers from the dataset + audit. Capability-aware: a layer whose
 * signal is absent comes back `available: false` with no features. Pure.
 */
export function buildGeoLayers(dataset: TisDataset, audit: TerritoryAudit): Record<GeoLayerId, GeoLayer> {
  const { capabilities } = resolveCapabilities(dataset);
  const customers = geoCustomers(dataset);
  const whiteSpaceIds = new Set([...audit.whiteSpace.unassigned, ...audit.whiteSpace.neverVisited, ...audit.whiteSpace.noCadence]);

  // 1. Customers — coloured by grade (neutral when ungraded).
  const customersLayer: GeoLayer = {
    id: 'customers', available: customers.length > 0,
    features: customers.map((c) => ({ ...baseFeature(c), category: c.grade ?? '—', color: c.grade ? GRADE_COLORS[c.grade] ?? NEUTRAL : NEUTRAL, value: c.salesValue ?? undefined })),
    legend: legendFrom(customers.map((c) => c.grade ?? '—'), (k) => (k === '—' ? NEUTRAL : GRADE_COLORS[k] ?? NEUTRAL), (k) => (k === '—' ? 'Ungraded' : k.toUpperCase())),
  };

  // 2. Coverage — by status (Mode B/C).
  const coverageLayer: GeoLayer = {
    id: 'coverage', available: capabilities.coverageOverlay,
    features: capabilities.coverageOverlay
      ? customers.filter((c) => c.coverage).map((c) => ({ ...baseFeature(c), category: c.coverage!, color: COVERAGE_COLORS[c.coverage!] }))
      : [],
    legend: (['never_visited', 'under_covered', 'over_covered', 'on_track'] as CoverageStatus[]).map((s) => ({ category: s, label: s, color: COVERAGE_COLORS[s] })),
  };

  // 3. Ownership — by salesman (hashed palette).
  const ownershipLayer: GeoLayer = {
    id: 'ownership', available: customers.some((c) => c.ownership.salesmanId),
    features: customers.map((c) => ({ ...baseFeature(c), category: c.ownership.salesmanId ?? '', color: c.ownership.salesmanId ? hashColor(c.ownership.salesmanId) : NEUTRAL })),
    legend: legendFrom(customers.map((c) => c.ownership.salesmanId ?? ''), (k) => (k ? hashColor(k) : NEUTRAL), (k) => k || 'Unassigned'),
  };

  // 4. White-space — un-worked (red) vs worked (neutral).
  const whitespaceLayer: GeoLayer = {
    id: 'whitespace', available: whiteSpaceIds.size > 0,
    features: customers.map((c) => {
      const ws = whiteSpaceIds.has(c.id);
      return { ...baseFeature(c), category: ws ? 'whitespace' : 'worked', color: ws ? '#dc2626' : '#cbd5e1' };
    }),
    legend: [{ category: 'whitespace', label: 'White-space', color: '#dc2626' }, { category: 'worked', label: 'Worked', color: '#cbd5e1' }],
  };

  // 5. Territory imbalance — by region (hashed); legend carries each region's balance.
  const balByRegion = new Map((audit.territoryBalance?.groups ?? []).map((g) => [g.key, g]));
  const imbalanceLayer: GeoLayer = {
    id: 'imbalance', available: !!audit.territoryBalance,
    features: audit.territoryBalance
      ? customers.map((c) => ({ ...baseFeature(c), category: c.ownership.regionId ?? '', color: c.ownership.regionId ? hashColor(c.ownership.regionId) : NEUTRAL, value: c.ownership.regionId ? balByRegion.get(c.ownership.regionId)?.coveragePct : undefined }))
      : [],
    legend: legendFrom(customers.map((c) => c.ownership.regionId ?? ''), (k) => (k ? hashColor(k) : NEUTRAL), (k) => k || 'Unassigned'),
  };

  return { customers: customersLayer, coverage: coverageLayer, ownership: ownershipLayer, whitespace: whitespaceLayer, imbalance: imbalanceLayer };
}

/** Build a de-duplicated legend from a list of category keys. Pure. */
function legendFrom(keys: string[], colorOf: (k: string) => string, labelOf: (k: string) => string): GeoLegendItem[] {
  const seen = new Set<string>();
  const out: GeoLegendItem[] = [];
  for (const k of keys) {
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ category: k, label: labelOf(k), color: colorOf(k) });
  }
  return out.slice(0, 16);
}
