/**
 * KPI scorecards — pure helpers (no I/O). Achievement % + status banding for the
 * manager command center, adapted from CRM/PM KPI-card patterns (Twenty, Plane,
 * Monday). Pure + testable.
 */

export type ScoreStatus = 'ahead' | 'onTrack' | 'behind' | 'critical';

/** Achievement of `actual` against `target`, as an integer %. When target ≤ 0,
 *  any positive actual is treated as 100% (target met), else 0%. */
export function achievementPct(actual: number, target: number): number {
  if (!Number.isFinite(actual) || actual < 0) actual = 0;
  if (!Number.isFinite(target) || target <= 0) return actual > 0 ? 100 : 0;
  return Math.round((actual / target) * 100);
}

/** Status band for an achievement %: ahead ≥100, onTrack ≥80, behind ≥50, else critical. */
export function scoreStatus(pct: number): ScoreStatus {
  if (pct >= 100) return 'ahead';
  if (pct >= 80) return 'onTrack';
  if (pct >= 50) return 'behind';
  return 'critical';
}

/** Direction for a period-over-period delta (for the StatCard trend prop). */
export function trendDir(current: number, previous: number): 'up' | 'down' | 'flat' {
  if (current > previous) return 'up';
  if (current < previous) return 'down';
  return 'flat';
}

/** Signed delta % vs a previous value (0 previous → 0 to avoid div-by-zero noise). */
export function deltaPct(current: number, previous: number): number {
  if (!previous) return 0;
  return Math.round(((current - previous) / Math.abs(previous)) * 100);
}
