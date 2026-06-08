// ============================================================================
// Perfect Store Engine — configurable scorecards (Phase 7C). Pure. Company-
// configurable weighted scorecards with channel / region / customer-type rules,
// scored by REUSING perfectStorePillars (same drop-null/renormalise/band as the
// platform). The most-specific matching scorecard wins (no hardcoded weights).
// Pillars cover MSL · OSA · OOS · share-of-shelf · visibility · pricing ·
// promotion · display compliance. No I/O.
// ============================================================================

import { perfectStorePillars, perfectStoreBand, type PerfectStoreBand } from '@/lib/erp/perfect-store';

export interface ScorecardPillarWeight { key: string; label?: string; weight: number }

export interface Scorecard {
  id: string;
  name: string;
  channel?: string | null;
  regionId?: string | null;
  customerType?: string | null;
  pillarWeights: ScorecardPillarWeight[];
  priority?: number;        // tie-break when specificity is equal (higher wins)
}

export interface OutletContext {
  channel?: string | null;
  regionId?: string | null;
  customerType?: string | null;
}

/** Specificity = number of matched non-null dimensions (−1 if any set dim mismatches). */
function specificity(sc: Scorecard, ctx: OutletContext): number {
  let score = 0;
  for (const [scv, cv] of [[sc.channel, ctx.channel], [sc.regionId, ctx.regionId], [sc.customerType, ctx.customerType]] as const) {
    if (scv == null) continue;          // wildcard dimension
    if (scv === cv) score += 1; else return -1;  // a set dimension that mismatches disqualifies
  }
  return score;
}

/** Resolve the best-matching scorecard for an outlet (most specific, then priority). Pure. */
export function resolveScorecard(scorecards: readonly Scorecard[], ctx: OutletContext): Scorecard | undefined {
  return scorecards
    .map((sc) => ({ sc, spec: specificity(sc, ctx) }))
    .filter((x) => x.spec >= 0)
    .sort((a, b) => b.spec - a.spec || (b.sc.priority ?? 0) - (a.sc.priority ?? 0))[0]?.sc;
}

export interface OutletScore {
  score: number;            // 0..100
  band: PerfectStoreBand;
  hasData: boolean;
  pillars: { key: string; label?: string; pct: number; weight: number }[];
}

/**
 * Score an outlet against a scorecard. `pillarValues` maps pillar key → 0..100
 * (or null = no data, drops out). Reuses perfectStorePillars. Pure.
 */
export function scoreOutlet(scorecard: Scorecard, pillarValues: Record<string, number | null>): OutletScore {
  const result = perfectStorePillars(
    scorecard.pillarWeights.map((w) => ({ key: w.key, label: w.label, pct: pillarValues[w.key] ?? null, weight: w.weight })),
  );
  return { score: result.score, band: result.band, hasData: result.hasData, pillars: result.pillars };
}

/** Band a 0..100 score (reuses the platform banding). Pure. */
export function perfectStoreBandFor(score: number, hasData = true): PerfectStoreBand {
  return perfectStoreBand(score, hasData);
}
