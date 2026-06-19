/**
 * Journey-plan visit cadence (CJ-2) — pure, no I/O. Decides whether a planned
 * visit is DUE on a given date, enforcing the weekly/biweekly/monthly frequency
 * against the plan's `effective_from` anchor. Mirrors the SQL added to
 * `erp_today_journey` so the TS and DB layers agree. Weekly (and any unknown
 * frequency) is always due on its matching day-of-week; biweekly = every 2nd
 * matching week; monthly = every 4th.
 */

/** getUTCDay() 0..6 → day code. */
const DOW = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const WEEK_MS = 7 * 86_400_000;

export interface PlanCadence {
  dayOfWeek: string;
  frequency: string; // 'weekly' | 'biweekly' | 'monthly' | (forward-compat)
  effectiveFrom: string; // YYYY-MM-DD
  effectiveTo?: string | null;
}

export function isVisitDueOn(plan: PlanCadence, asOf: string): boolean {
  const date = new Date(`${asOf}T00:00:00Z`);
  const from = new Date(`${plan.effectiveFrom}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || Number.isNaN(from.getTime())) return false;
  if (date < from) return false;
  if (plan.effectiveTo) {
    const to = new Date(`${plan.effectiveTo}T00:00:00Z`);
    if (!Number.isNaN(to.getTime()) && date > to) return false;
  }
  if (DOW[date.getUTCDay()] !== plan.dayOfWeek) return false;
  const weeksSince = Math.floor((date.getTime() - from.getTime()) / WEEK_MS);
  if (plan.frequency === 'biweekly') return weeksSince % 2 === 0;
  if (plan.frequency === 'monthly') return weeksSince % 4 === 0;
  return true; // weekly + unknown → always due on the matching day
}
