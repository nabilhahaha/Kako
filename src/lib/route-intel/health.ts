// ============================================================================
// Route & Territory Intelligence — health scoring (Phase 7D). Pure. One composite
// health score (0..100 + band) for a route / salesman / territory from coverage,
// strike rate, adherence, call compliance, and visit productivity — REUSING
// perfectStorePillars (same drop-null/renormalise/band as the platform). Weights
// are configurable (no hardcoding). No I/O.
// ============================================================================

import { perfectStorePillars, perfectStoreBand, type PerfectStoreBand } from '@/lib/erp/perfect-store';

export type IntelEntityType = 'route' | 'salesman' | 'territory' | 'supervisor';

export interface HealthInputs {
  coveragePct?: number | null;
  strikeRatePct?: number | null;
  adherencePct?: number | null;
  callCompliancePct?: number | null;
  productivityPct?: number | null;   // e.g. productive calls per planned
}

export interface HealthWeights {
  coverage: number; strike: number; adherence: number; compliance: number; productivity: number;
}

/** Coverage-led default weighting (company-overridable). */
export const DEFAULT_HEALTH_WEIGHTS: HealthWeights = { coverage: 0.3, strike: 0.25, adherence: 0.2, compliance: 0.15, productivity: 0.1 };

export interface HealthScore {
  score: number;            // 0..100
  band: PerfectStoreBand;
  hasData: boolean;
  pillars: { key: string; pct: number; weight: number }[];
}

/** Composite health score for an entity. Pillars with no data drop + renormalise. Pure. */
export function healthScore(i: HealthInputs, w: HealthWeights = DEFAULT_HEALTH_WEIGHTS): HealthScore {
  const r = perfectStorePillars([
    { key: 'coverage', pct: i.coveragePct ?? null, weight: w.coverage },
    { key: 'strike', pct: i.strikeRatePct ?? null, weight: w.strike },
    { key: 'adherence', pct: i.adherencePct ?? null, weight: w.adherence },
    { key: 'compliance', pct: i.callCompliancePct ?? null, weight: w.compliance },
    { key: 'productivity', pct: i.productivityPct ?? null, weight: w.productivity },
  ]);
  return { score: r.score, band: r.band, hasData: r.hasData, pillars: r.pillars.map((p) => ({ key: p.key, pct: p.pct, weight: p.weight })) };
}

/** Band a 0..100 health score. Pure. */
export function healthBand(score: number, hasData = true): PerfectStoreBand {
  return perfectStoreBand(score, hasData);
}
