/**
 * Balance metric (TIS) — pure. 100 = perfectly even; falls with the spread of a
 * weight (workload / value / count) across groups (routes, territories, reps).
 * Shared by scenario metrics (TIS-0-3) and the Territory Audit (TA-1).
 */

/** 100 = perfectly balanced; 0 = maximally uneven. Pure. */
export function balancePct(values: readonly number[]): number {
  if (values.length < 2) return 100;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  if (mean <= 0) return 100;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  const cv = Math.sqrt(variance) / mean; // coefficient of variation
  return Math.round(Math.max(0, Math.min(1, 1 - cv)) * 1000) / 10;
}
