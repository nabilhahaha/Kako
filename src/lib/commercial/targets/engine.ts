// ============================================================================
// Commercial Excellence — sales target engine (Phase 7). Pure. Multi-dimensional
// targets (value/volume/coverage/collections/distribution/brand/SKU/customer/
// route) assigned at any level (salesman/supervisor/area/regional/branch/region),
// with achievement + run-rate forecast. Extends erp_targets (0139). No I/O.
// ============================================================================

export type TargetType =
  | 'sales_value' | 'sales_volume' | 'coverage' | 'collections' | 'distribution'
  | 'brand' | 'sku' | 'customer' | 'route';

export type TargetLevel =
  | 'salesman' | 'supervisor' | 'area_manager' | 'regional_manager' | 'branch' | 'region';

export interface TargetAchievementInput {
  target: number;
  actual: number;
  daysElapsed: number;
  daysTotal: number;
}

export interface TargetAchievementResult {
  target: number;
  actual: number;
  achievementPct: number;
  gap: number;                  // target − actual (positive = behind)
  requiredDailyRunRate: number; // to hit target over remaining days
  forecastAchievement: number;  // projected final actual at current run-rate
  forecastAchievementPct: number;
  status: 'ahead' | 'on_track' | 'behind' | 'critical';
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const pct = (a: number, b: number): number => (b > 0 ? round2((a / b) * 100) : 0);

/** Compute achievement + run-rate forecast for a target. Pure. */
export function computeAchievement(i: TargetAchievementInput): TargetAchievementResult {
  const gap = round2(i.target - i.actual);
  const daysRemaining = Math.max(0, i.daysTotal - i.daysElapsed);
  const runRate = i.daysElapsed > 0 ? i.actual / i.daysElapsed : 0;
  const forecast = round2(i.daysElapsed > 0 ? runRate * i.daysTotal : 0);
  const forecastPct = pct(forecast, i.target);
  const expectedPct = i.daysTotal > 0 ? (i.daysElapsed / i.daysTotal) * 100 : 0;
  const achievementPct = pct(i.actual, i.target);
  const status: TargetAchievementResult['status'] =
    forecastPct >= 100 ? 'ahead' : achievementPct >= expectedPct - 5 ? 'on_track' : forecastPct >= 80 ? 'behind' : 'critical';
  return {
    target: round2(i.target),
    actual: round2(i.actual),
    achievementPct,
    gap,
    requiredDailyRunRate: daysRemaining > 0 ? round2(Math.max(0, gap) / daysRemaining) : 0,
    forecastAchievement: forecast,
    forecastAchievementPct: forecastPct,
    status,
  };
}
