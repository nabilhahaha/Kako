// ============================================================================
// Route Riding — scoring engine (Phase 3 FMCG). Pure. NO hardcoded scores, NO
// hardcoded FMCG rules: criteria (category/weight/maxScore) and category weights
// are DATA supplied by the company config. Criteria roll up per category, then
// categories roll up to one 0..100 ride score REUSING perfectStorePillars (same
// drop-nulls/renormalise/band semantics as Perfect Store + the rep scorecard, so
// rides, reps, and outlets score consistently across the platform).
// ============================================================================

import { perfectStorePillars, perfectStoreBand } from '@/lib/erp/perfect-store';
import type { RideCriterion, RideEvaluation, CategoryScore, RideScoreResult, RideBand } from './types';

/** Roll criteria scores up per category → 0..100 (weighted by criterion weight). Pure. */
export function categoryScores(
  criteria: readonly RideCriterion[],
  evaluations: readonly RideEvaluation[],
): CategoryScore[] {
  const byId = new Map(criteria.map((c) => [c.id, c]));
  const acc = new Map<string, { weight: number; rawScore: number; rawMax: number; count: number }>();
  for (const e of evaluations) {
    const c = byId.get(e.criterionId);
    if (!c || c.weight <= 0 || c.maxScore <= 0) continue;
    const score = Math.max(0, Math.min(c.maxScore, e.score));
    const g = acc.get(c.category) ?? { weight: 0, rawScore: 0, rawMax: 0, count: 0 };
    g.rawScore += score * c.weight;
    g.rawMax += c.maxScore * c.weight;
    g.weight += c.weight;
    g.count += 1;
    acc.set(c.category, g);
  }
  return [...acc.entries()]
    .map(([category, g]) => ({
      category,
      score: g.rawMax > 0 ? Math.round((g.rawScore / g.rawMax) * 100) : 0,
      weight: g.weight,
      rawScore: g.rawScore,
      rawMax: g.rawMax,
      criteriaCount: g.count,
    }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

/**
 * Score a ride/customer-evaluation. `categoryWeights` (DATA) overrides the
 * default per-category weight in the overall rollup; absent → each category's
 * summed criterion weight is used. Pure.
 */
export function scoreRide(
  criteria: readonly RideCriterion[],
  evaluations: readonly RideEvaluation[],
  opts: { categoryWeights?: Record<string, number> } = {},
): RideScoreResult {
  const categories = categoryScores(criteria, evaluations);
  const rolled = perfectStorePillars(
    categories.map((c) => ({
      key: c.category,
      pct: c.score,
      weight: opts.categoryWeights?.[c.category] ?? c.weight,
    })),
  );
  return {
    overall: rolled.score,
    band: rolled.band as RideBand,
    hasData: rolled.hasData,
    categories,
  };
}

/** Route compliance for a ride: visited / planned × 100. Pure. */
export function routeComplianceScore(planned: number, visited: number): number | null {
  if (planned <= 0) return null;
  return Math.round((Math.min(visited, planned) / planned) * 100);
}

/** Pull a named category's 0..100 score (e.g. 'merchandising'), or null. Pure. */
export function namedCategoryScore(result: RideScoreResult, category: string): number | null {
  return result.categories.find((c) => c.category === category)?.score ?? null;
}

/** Band a 0..100 score (reuses the Perfect Store banding). Pure. */
export function rideBand(score: number, hasData = true): RideBand {
  return perfectStoreBand(score, hasData) as RideBand;
}
