// ============================================================================
// Route Optimization — recommendation engine (Phase 3 FMCG). Pure, rule-based
// (deterministic, explainable — not a black box): turns balance analysis +
// frequency mismatches into actionable suggestions (route change, customer
// reassignment, territory split/merge, frequency change). No I/O.
// ============================================================================

import type { BalanceResult } from './balancing';

export type RecommendationType =
  | 'route_change' | 'customer_reassignment' | 'territory_split' | 'territory_merge' | 'frequency_change';

export interface Recommendation {
  type: RecommendationType;
  subjectId: string;
  detail: string;
  rationale: string;
}

/** Suggest splits/reassignments for overloaded routes and merges for idle ones. Pure. */
export function recommendFromBalance(balance: BalanceResult): Recommendation[] {
  const recs: Recommendation[] = [];
  for (const r of balance.rows) {
    if (r.status === 'overloaded') {
      recs.push({
        type: r.deviationPct >= 60 ? 'territory_split' : 'customer_reassignment',
        subjectId: r.routeId,
        detail: r.deviationPct >= 60 ? `Split route ${r.routeId}` : `Reassign customers off route ${r.routeId}`,
        rationale: `${balance.metric} is ${r.deviationPct}% above the mean (${balance.mean}).`,
      });
    } else if (r.status === 'underutilized') {
      recs.push({
        type: 'territory_merge',
        subjectId: r.routeId,
        detail: `Merge or extend route ${r.routeId}`,
        rationale: `${balance.metric} is ${Math.abs(r.deviationPct)}% below the mean (${balance.mean}).`,
      });
    }
  }
  return recs;
}

/** Suggest frequency changes where actual visit cadence diverges from the rule. Pure. */
export function recommendFrequencyChanges(
  rows: readonly { customerId: string; classification: string; expectedVisitsPerWeek: number; actualVisitsPerWeek: number }[],
  tolerance = 0.5,
): Recommendation[] {
  return rows
    .filter((r) => Math.abs(r.actualVisitsPerWeek - r.expectedVisitsPerWeek) > tolerance)
    .map((r) => ({
      type: 'frequency_change' as const,
      subjectId: r.customerId,
      detail: r.actualVisitsPerWeek > r.expectedVisitsPerWeek
        ? `Reduce visits for ${r.customerId} toward ${r.expectedVisitsPerWeek}/wk`
        : `Increase visits for ${r.customerId} toward ${r.expectedVisitsPerWeek}/wk`,
      rationale: `Class ${r.classification} expects ${r.expectedVisitsPerWeek}/wk; actual ${r.actualVisitsPerWeek}/wk.`,
    }));
}
