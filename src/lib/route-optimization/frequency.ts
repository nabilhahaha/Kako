// ============================================================================
// Route Optimization — visit frequency engine (Phase 3 FMCG). Pure. NO hardcoded
// frequencies: rules (classification → visits/week) are DATA (company-overridable;
// defaults provided + seeded into erp_visit_frequency_rules). Translates a
// customer's classification into how many visits/week and which working days.
// ============================================================================

export interface FrequencyRule {
  classification: string;   // 'a' | 'b' | 'c' | 'd' | company-defined
  visitsPerWeek: number;    // may be fractional (e.g. 0.5 = biweekly)
}

/** Default A/B/C/D rules (company-overridable; not hardcoded into logic). */
export const DEFAULT_FREQUENCY_RULES: readonly FrequencyRule[] = [
  { classification: 'a', visitsPerWeek: 3 },   // 2–3 weekly (upper bound)
  { classification: 'b', visitsPerWeek: 2 },   // 1–2 weekly (upper bound)
  { classification: 'c', visitsPerWeek: 1 },   // weekly
  { classification: 'd', visitsPerWeek: 0.5 }, // biweekly
];

export type FrequencyInterval = 'multi_weekly' | 'weekly' | 'biweekly' | 'monthly';

/** Visits/week for a classification, or null when no rule matches. Pure. */
export function visitsPerWeekFor(rules: readonly FrequencyRule[], classification: string): number | null {
  return rules.find((r) => r.classification === classification)?.visitsPerWeek ?? null;
}

/** Bucket a visits/week value into an interval label. Pure. */
export function intervalFor(visitsPerWeek: number): FrequencyInterval {
  if (visitsPerWeek >= 2) return 'multi_weekly';
  if (visitsPerWeek >= 1) return 'weekly';
  if (visitsPerWeek >= 0.5) return 'biweekly';
  return 'monthly';
}

/**
 * Spread `visitsPerWeek` visits across the given working days (evenly). Returns
 * the chosen working-day indices into `workingDays`. Fractional rates pick a
 * single day (the cadence is handled by week-of rotation upstream). Pure.
 */
export function visitDaysFor(visitsPerWeek: number, workingDays: readonly string[]): string[] {
  const n = Math.max(0, Math.min(workingDays.length, Math.round(visitsPerWeek)));
  if (n <= 0) return workingDays.length ? [workingDays[0]] : []; // biweekly+ → one day, rotated by week
  if (n >= workingDays.length) return [...workingDays];
  const step = workingDays.length / n;
  return Array.from({ length: n }, (_, i) => workingDays[Math.floor(i * step)]);
}
