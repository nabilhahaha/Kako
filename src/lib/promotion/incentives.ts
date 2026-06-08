// ============================================================================
// Promotion Platform — incentive engine (Phase 4+). Pure. UNLIMITED incentive
// layers (any number of role rewards on one promotion): fixed per role, or
// achievement-scaled. Supports proportional reversal (returns claw back excess
// incentive). No hardcoded roles/amounts — layers are data.
// ============================================================================

export interface IncentiveLayer {
  role: string;             // 'salesman' | 'supervisor' | 'area_manager' | ... (open)
  amount: number;           // base reward
  achievementScaled?: boolean;  // scale by achievement% when true
}

export interface IncentivePayout {
  role: string;
  gross: number;
  net: number;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Compute incentive payouts for every layer. `achievementPct` (0..100+) scales
 * achievement-scaled layers; fixed layers pay in full once `qualified`. Pure.
 */
export function computeIncentives(
  layers: readonly IncentiveLayer[],
  opts: { achievementPct?: number; qualified?: boolean; deductions?: Record<string, number> } = {},
): IncentivePayout[] {
  const qualified = opts.qualified ?? true;
  const ach = Math.max(0, opts.achievementPct ?? 100) / 100;
  return layers.map((l) => {
    const gross = !qualified ? 0 : l.achievementScaled ? round2(l.amount * ach) : l.amount;
    const net = round2(Math.max(0, gross - (opts.deductions?.[l.role] ?? 0)));
    return { role: l.role, gross, net };
  });
}

/**
 * Incentive reversal for a return: the excess incentive to claw back per role,
 * given the earned payouts and the reversal ratio (returned / original). Pure.
 */
export function reverseIncentives(payouts: readonly IncentivePayout[], reversalRatio: number): { role: string; reversal: number }[] {
  const r = Math.max(0, Math.min(1, reversalRatio));
  return payouts.map((p) => ({ role: p.role, reversal: round2(p.net * r) }));
}
