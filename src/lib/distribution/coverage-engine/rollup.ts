/**
 * Coverage Engine — rollup read-model (CV-1). Pure, no I/O. Aggregates per-customer
 * coverage statuses (CJ-3) into manager/supervisor counts + a headline coverage %,
 * optionally grouped by salesman / route / region. One source of truth behind the
 * coverage dashboard, Customer 360, Journey Planning, Geo, Territory Audit, Sales
 * Force Sizing, and TIS — no duplicated logic.
 */
import type { CoverageStatus } from '@/lib/distribution/journey-plan/coverage-status';

export interface CoverageRollup {
  total: number;
  onTrack: number;
  underCovered: number;
  overCovered: number;
  neverVisited: number;
  /** Headline: customers covered at or above plan (onTrack + overCovered) ÷ total,
   *  one decimal. The Simple-Mode "Coverage %". */
  coveragePct: number;
}

const pct1 = (num: number, den: number): number => (den <= 0 ? 0 : Math.round((num / den) * 1000) / 10);

/** Aggregate a flat list of coverage statuses into a rollup. Pure. */
export function rollupCoverage(statuses: readonly CoverageStatus[]): CoverageRollup {
  let onTrack = 0, underCovered = 0, overCovered = 0, neverVisited = 0;
  for (const s of statuses) {
    if (s === 'on_track') onTrack++;
    else if (s === 'under_covered') underCovered++;
    else if (s === 'over_covered') overCovered++;
    else neverVisited++;
  }
  const total = statuses.length;
  return { total, onTrack, underCovered, overCovered, neverVisited, coveragePct: pct1(onTrack + overCovered, total) };
}

/** A grouped rollup row (key = salesman/route/region id; label resolved upstream). */
export interface CoverageGroupRollup extends CoverageRollup {
  key: string;
}

/**
 * Group items by a key and roll up each group's coverage statuses. Items with a
 * null/empty key are bucketed under `''` (e.g. unassigned). Returned newest-worst
 * first is the caller's concern; here groups preserve first-seen order. Pure.
 */
export function groupCoverageRollup<T>(
  items: readonly T[],
  keyOf: (item: T) => string | null | undefined,
  statusOf: (item: T) => CoverageStatus,
): CoverageGroupRollup[] {
  const byKey = new Map<string, CoverageStatus[]>();
  for (const item of items) {
    const key = keyOf(item) ?? '';
    const list = byKey.get(key) ?? [];
    list.push(statusOf(item));
    byKey.set(key, list);
  }
  return [...byKey.entries()].map(([key, statuses]) => ({ key, ...rollupCoverage(statuses) }));
}
