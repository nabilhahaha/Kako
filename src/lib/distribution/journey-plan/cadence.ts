/**
 * Journey-plan visit cadence (CJ-2 + FR-6) — pure, no I/O. Decides whether a
 * planned visit is DUE on a given date, enforcing the frequency against the
 * plan's `effective_from` anchor. Mirrors the SQL in `erp_today_journey` so the
 * TS and DB layers agree.
 *
 * Cadence is expressed as a WEEK INTERVAL derived from the canonical frequency
 * token (FR-1) — unifying the legacy enum (weekly=1, biweekly=2, monthly=4) with
 * annual (52) and custom cadences (every N weeks/months/years). A visit is due on
 * its matching day-of-week when the whole-weeks-since-anchor is a multiple of the
 * interval. Unknown/unparseable frequency stays always-due (forward-compatible).
 */
import { parseFrequency } from '@/lib/route-optimization/visit-frequency';

/** getUTCDay() 0..6 → day code. */
const DOW = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const WEEK_MS = 7 * 86_400_000;

export interface PlanCadence {
  dayOfWeek: string;
  frequency: string; // legacy enum 'weekly' | 'biweekly' | 'monthly' | (forward-compat)
  /** FR-6: canonical token (weekly|biweekly|monthly|annual or unit/everyN/visitsPerCycle).
   *  When present it is authoritative over `frequency` (annual/custom cadence). */
  frequencyToken?: string | null;
  effectiveFrom: string; // YYYY-MM-DD
  effectiveTo?: string | null;
}

/** Whole-week recurrence interval for a frequency token/enum, or null when
 *  unrecognized (⇒ always due). week→everyN, month→everyN×4, year→everyN×52.
 *  Mirrors `erp_freq_week_interval` in SQL. Pure. */
export function weekIntervalFor(token: string | null | undefined): number | null {
  const f = parseFrequency(token ?? undefined);
  if (!f) return null;
  const mult = f.unit === 'week' ? 1 : f.unit === 'month' ? 4 : 52;
  return f.everyN * mult;
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
  const interval = weekIntervalFor(plan.frequencyToken ?? plan.frequency);
  if (interval == null || interval <= 1) return true; // weekly + unknown → always due
  const weeksSince = Math.floor((date.getTime() - from.getTime()) / WEEK_MS);
  return weeksSince % interval === 0;
}
