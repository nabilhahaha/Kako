// ============================================================================
// Perfect Store Engine — leaderboard + trend read-models (Phase 7C). Pure rollups
// for the Perfect Store dashboard, outlet scorecard, team scorecard, and
// compliance leaderboard. No I/O.
// ============================================================================

export interface OutletScoreRow {
  customerId: string;
  salesmanId?: string | null;
  score: number;            // 0..100
  band: string;
  period?: string;
}

const avg = (ns: number[]): number => (ns.length ? Math.round(ns.reduce((s, n) => s + n, 0) / ns.length) : 0);

/** Compliance leaderboard — outlets ranked by score (desc). Pure. */
export function complianceLeaderboard(rows: readonly OutletScoreRow[]): OutletScoreRow[] {
  return [...rows].sort((a, b) => b.score - a.score);
}

export interface TeamScore { salesmanId: string; outlets: number; averageScore: number; perfectStores: number }

/** Team scorecard — per-salesman average + perfect-store (gold) count. Pure. */
export function teamScorecard(rows: readonly OutletScoreRow[], goldBand = 'gold'): TeamScore[] {
  const by = new Map<string, OutletScoreRow[]>();
  for (const r of rows) { const k = r.salesmanId ?? 'unassigned'; (by.get(k) ?? by.set(k, []).get(k)!).push(r); }
  return [...by.entries()]
    .map(([salesmanId, rs]) => ({ salesmanId, outlets: rs.length, averageScore: avg(rs.map((r) => r.score)), perfectStores: rs.filter((r) => r.band === goldBand).length }))
    .sort((a, b) => b.averageScore - a.averageScore);
}

/** Outlet score trend over periods (chronological) + direction. Pure. */
export function scoreTrend(snapshots: readonly { period: string; score: number }[]): { series: { period: string; score: number }[]; direction: 'improving' | 'declining' | 'stable' } {
  const series = [...snapshots].sort((a, b) => a.period.localeCompare(b.period));
  if (series.length < 2) return { series, direction: 'stable' };
  const delta = series[series.length - 1].score - series[0].score;
  return { series, direction: delta >= 5 ? 'improving' : delta <= -5 ? 'declining' : 'stable' };
}
