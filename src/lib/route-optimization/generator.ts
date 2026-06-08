// ============================================================================
// Route Optimization — journey plan generator (Phase 3 FMCG). Pure. Turns a
// customer set + frequency rules + working days into an optimized weekly plan:
// each customer is scheduled on N working days per its classification, then each
// day's stops are sequenced to minimize travel/backtracking. Reuses the frequency
// engine + the optimizer (which reuses journey-sort). No I/O.
// ============================================================================

import { visitsPerWeekFor, visitDaysFor, type FrequencyRule } from './frequency';
import { optimizeRoute, type OptimizeCustomer, type OptimizedRoute } from './optimize';
import type { LatLng } from '@/lib/erp/journey-sort';

export interface GenCustomer extends OptimizeCustomer {
  classification: string;
}

export interface DayPlan {
  day: string;
  customerIds: string[];
  route: OptimizedRoute;
}

/**
 * Generate an optimized weekly journey plan. Customers without a frequency rule
 * are skipped (no hardcoded default). Pure.
 */
export function generateWeeklyPlan(
  customers: readonly GenCustomer[],
  rules: readonly FrequencyRule[],
  workingDays: readonly string[],
  origin: LatLng | null = null,
): DayPlan[] {
  const perDay = new Map<string, GenCustomer[]>(workingDays.map((d) => [d, []]));
  for (const c of customers) {
    const vpw = visitsPerWeekFor(rules, c.classification);
    if (vpw == null || vpw <= 0) continue;
    for (const day of visitDaysFor(vpw, workingDays)) perDay.get(day)!.push(c);
  }
  return workingDays.map((day) => {
    const list = perDay.get(day) ?? [];
    return { day, customerIds: list.map((c) => c.customerId), route: optimizeRoute(list, origin) };
  });
}
