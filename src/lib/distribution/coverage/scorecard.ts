// ============================================================================
// Distribution — rep scorecard (Phase 3.x KPI scorecards). Pure. Composes a rep's
// FMCG field KPIs into one 0..100 supervisor score + band, REUSING the existing
// weighted-pillar scorer (perfectStorePillars) — same drop-nulls/renormalise/band
// semantics as the Perfect Store program, so reps and outlets score consistently.
// ============================================================================

import { perfectStorePillars, type PerfectStorePillarsResult } from '@/lib/erp/perfect-store';

export interface RepScorecardInputs {
  coveragePct: number | null;     // route coverage
  strikeRatePct: number | null;   // productive calls
  collectionPct?: number | null;  // collected / due (optional)
  returnRatePct?: number | null;  // returns as % of sales (optional; inverted into a quality pillar)
}

export interface RepScorecardWeights {
  coverage: number;
  strike: number;
  collection: number;
  quality: number;
}

/** Default weighting: coverage-led, then productivity, then cash, then quality. */
export const DEFAULT_REP_WEIGHTS: RepScorecardWeights = { coverage: 0.4, strike: 0.3, collection: 0.2, quality: 0.1 };

const clamp = (n: number) => Math.max(0, Math.min(100, n));

/** Composite rep scorecard. Pillars with no data drop out and the rest
 *  renormalise (via perfectStorePillars). `quality` = 100 − returnRate% (fewer
 *  returns is better). Pure. */
export function repScorecard(
  inp: RepScorecardInputs,
  weights: RepScorecardWeights = DEFAULT_REP_WEIGHTS,
): PerfectStorePillarsResult {
  return perfectStorePillars([
    { key: 'coverage', pct: inp.coveragePct, weight: weights.coverage },
    { key: 'strike', pct: inp.strikeRatePct, weight: weights.strike },
    { key: 'collection', pct: inp.collectionPct ?? null, weight: weights.collection },
    { key: 'quality', pct: inp.returnRatePct == null ? null : clamp(100 - inp.returnRatePct), weight: weights.quality },
  ]);
}
