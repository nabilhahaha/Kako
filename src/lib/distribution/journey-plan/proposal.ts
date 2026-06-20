/**
 * Journey-plan generation — pure proposal helpers (CJ-1). No I/O. Wraps the
 * existing route-optimization generator with conflict detection so the wizard can
 * show a preview before writing `erp_journey_plans`. Frequency rules + grades are
 * supplied by the caller (company-configurable; nothing hardcoded here).
 */
import type { DayPlan } from '@/lib/route-optimization/generator';

/** An existing journey-plan row (for conflict detection). */
export interface ExistingPlanRow {
  customer_id: string;
  day_of_week: string;
  route_id: string | null;
}

/** A (customer, day) that the generated plan would duplicate against an existing
 *  journey-plan entry — flagged so the manager can resolve before applying. */
export interface PlanConflict {
  customerId: string;
  day: string;
}

/** Conflicts = generated (customer, day) pairs already present in journey plans. */
export function detectPlanConflicts(
  dayPlans: readonly DayPlan[],
  existing: readonly ExistingPlanRow[],
): PlanConflict[] {
  const have = new Set(existing.map((e) => `${e.customer_id}|${e.day_of_week}`));
  const out: PlanConflict[] = [];
  for (const dp of dayPlans) {
    for (const cid of dp.customerIds) {
      if (have.has(`${cid}|${dp.day}`)) out.push({ customerId: cid, day: dp.day });
    }
  }
  return out;
}

/** Count of scheduled stops across the week (sum of per-day customer counts). */
export function totalScheduledStops(dayPlans: readonly DayPlan[]): number {
  return dayPlans.reduce((n, d) => n + d.customerIds.length, 0);
}
