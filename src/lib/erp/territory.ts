/**
 * Territory health — pure rollups (no I/O, no map dependency). Adapts the
 * "territory view" pattern (route/region health) into a dependency-free health
 * grid: per-route coverage banding + a summary. A true geo-map is intentionally
 * deferred (needs a map library + GPS data from later migrations).
 */

import { coverageBand } from './attention';

export interface RouteCoverage {
  route: string;
  coveragePct: number | null;
  visits?: number;
}

export interface TerritoryRollup extends RouteCoverage {
  band: 'good' | 'attention' | 'critical' | 'unknown';
}

const BAND_RANK: Record<TerritoryRollup['band'], number> = { critical: 0, attention: 1, unknown: 2, good: 3 };

/** Worst-first rollup so the routes needing attention surface at the top. */
export function rollupTerritory(rows: readonly RouteCoverage[]): TerritoryRollup[] {
  return rows
    .map((r) => ({ ...r, band: coverageBand(r.coveragePct) }))
    .sort((a, b) => BAND_RANK[a.band] - BAND_RANK[b.band] || (a.coveragePct ?? 999) - (b.coveragePct ?? 999));
}

export interface TerritorySummary {
  routes: number;
  good: number;
  attention: number;
  critical: number;
  avgCoverage: number | null;
}

export function territorySummary(rows: readonly RouteCoverage[]): TerritorySummary {
  const rolled = rollupTerritory(rows);
  const known = rolled.filter((r) => r.coveragePct != null);
  const avg = known.length ? Math.round(known.reduce((n, r) => n + (r.coveragePct ?? 0), 0) / known.length) : null;
  return {
    routes: rolled.length,
    good: rolled.filter((r) => r.band === 'good').length,
    attention: rolled.filter((r) => r.band === 'attention').length,
    critical: rolled.filter((r) => r.band === 'critical').length,
    avgCoverage: avg,
  };
}
