// ============================================================================
// Visit-Frequency value model (FR-1). Pure, no I/O. Industry-agnostic: a single
// normalized representation of "how often" a customer is visited that covers
// weekly / biweekly / monthly today and annual / custom cadences in future,
// across FMCG · Distribution · Wholesale · any vertical.
//
// Representation: every `everyN` `unit`s, make `visitsPerCycle` visits.
//   weekly         → { unit:'week',  everyN:1, visitsPerCycle:1 }
//   A-grade 3/week → { unit:'week',  everyN:1, visitsPerCycle:3 }
//   biweekly       → { unit:'week',  everyN:2, visitsPerCycle:1 }
//   monthly        → { unit:'month', everyN:1, visitsPerCycle:1 }
//   every 2 months → { unit:'month', everyN:2, visitsPerCycle:1 }
//   annual         → { unit:'year',  everyN:1, visitsPerCycle:1 }
//
// Backward-compatible: maps onto the existing visits/week float and the
// journey_plans `weekly|biweekly|monthly` enum without changing either.
// ============================================================================
import { intervalFor } from './frequency';

export type FrequencyUnit = 'week' | 'month' | 'year';

export interface VisitFrequency {
  unit: FrequencyUnit;
  /** Cycle length in units (>= 1). e.g. monthly everyN=2 ⇒ every 2 months. */
  everyN: number;
  /** Visits within one cycle (>= 1). e.g. 3 ⇒ three visits per cycle. */
  visitsPerCycle: number;
}

/** Average weeks per calendar month / year (cadence math, not billing). */
export const WEEKS_PER_MONTH = 52 / 12; // ≈ 4.333
export const WEEKS_PER_YEAR = 52;

/** Validate + clone into a normalized VisitFrequency, or null when invalid.
 *  everyN/visitsPerCycle are coerced to positive integers. Pure. */
export function makeFrequency(unit: FrequencyUnit, everyN = 1, visitsPerCycle = 1): VisitFrequency | null {
  if (unit !== 'week' && unit !== 'month' && unit !== 'year') return null;
  const e = Math.floor(everyN);
  const v = Math.floor(visitsPerCycle);
  if (!Number.isFinite(e) || !Number.isFinite(v) || e < 1 || v < 1) return null;
  return { unit, everyN: e, visitsPerCycle: v };
}

/** Friendly aliases for the common cadences (both directions). */
const ALIASES: Record<string, VisitFrequency> = {
  weekly: { unit: 'week', everyN: 1, visitsPerCycle: 1 },
  biweekly: { unit: 'week', everyN: 2, visitsPerCycle: 1 },
  monthly: { unit: 'month', everyN: 1, visitsPerCycle: 1 },
  annual: { unit: 'year', everyN: 1, visitsPerCycle: 1 },
  yearly: { unit: 'year', everyN: 1, visitsPerCycle: 1 },
};

const eq = (a: VisitFrequency, b: VisitFrequency) =>
  a.unit === b.unit && a.everyN === b.everyN && a.visitsPerCycle === b.visitsPerCycle;

/**
 * Parse a canonical token into a VisitFrequency, or null when unparseable.
 * Accepts a friendly alias (`weekly|biweekly|monthly|annual|yearly`) or the
 * structured form `unit/everyN/visitsPerCycle` (e.g. `week/1/3`, `month/2/1`).
 * Pure.
 */
export function parseFrequency(token: string | null | undefined): VisitFrequency | null {
  if (!token) return null;
  const s = String(token).trim().toLowerCase();
  if (s in ALIASES) return { ...ALIASES[s] };
  const m = /^(week|month|year)\/(\d+)\/(\d+)$/.exec(s);
  if (!m) return null;
  return makeFrequency(m[1] as FrequencyUnit, Number(m[2]), Number(m[3]));
}

/**
 * Format a VisitFrequency to its canonical token — a friendly alias when it
 * matches one, otherwise the structured `unit/everyN/visitsPerCycle`. Pure.
 */
export function formatFrequency(freq: VisitFrequency): string {
  for (const [alias, f] of Object.entries(ALIASES)) {
    if (alias === 'yearly') continue; // prefer 'annual' as the canonical alias
    if (eq(freq, f)) return alias;
  }
  return `${freq.unit}/${freq.everyN}/${freq.visitsPerCycle}`;
}

/** Convert a VisitFrequency to a visits/week float (the existing bridge value).
 *  Pure. */
export function frequencyToVisitsPerWeek(freq: VisitFrequency): number {
  const perCycleWeeks =
    freq.unit === 'week' ? freq.everyN
    : freq.unit === 'month' ? freq.everyN * WEEKS_PER_MONTH
    : freq.everyN * WEEKS_PER_YEAR;
  return freq.visitsPerCycle / perCycleWeeks;
}

/**
 * Build a VisitFrequency from a visits/week rate (e.g. a classification rule's
 * value). Mirrors the existing `intervalFor` buckets so the classification path
 * is unchanged: >=1 ⇒ weekly (visitsPerCycle = round), >=0.5 ⇒ biweekly,
 * >0 ⇒ monthly, else null. Pure.
 */
export function frequencyFromVisitsPerWeek(visitsPerWeek: number): VisitFrequency | null {
  if (!Number.isFinite(visitsPerWeek) || visitsPerWeek <= 0) return null;
  if (visitsPerWeek >= 1) return makeFrequency('week', 1, Math.round(visitsPerWeek));
  if (visitsPerWeek >= 0.5) return makeFrequency('week', 2, 1); // biweekly
  return makeFrequency('month', 1, 1); // monthly (coarsest weekly-ish bucket)
}

/** Lenient synonyms accepted from spreadsheet imports (FR-4), mapped to a
 *  canonical alias. Keys are pre-lowercased/trimmed. */
const IMPORT_SYNONYMS: Record<string, string> = {
  'every week': 'weekly', 'once a week': 'weekly', '1/week': 'weekly', '1 per week': 'weekly', 'w': 'weekly',
  'fortnightly': 'biweekly', 'bi-weekly': 'biweekly', 'bi weekly': 'biweekly',
  'every 2 weeks': 'biweekly', 'every two weeks': 'biweekly', 'every other week': 'biweekly',
  'every month': 'monthly', 'once a month': 'monthly', '1/month': 'monthly', 'm': 'monthly',
  'every year': 'annual', 'once a year': 'annual', 'y': 'annual',
};

/**
 * Coerce a free-text spreadsheet cell into a CANONICAL frequency token, or null
 * when unrecognized (FR-4 import). Accepts: the strict forms (`parseFrequency`),
 * common synonyms (fortnightly, every 2 weeks, every month…), and a bare integer
 * 1–7 read as "N visits per week". Always returns the normalized token (so the
 * stored value round-trips). Pure.
 */
export function coerceFrequencyToken(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;
  const direct = parseFrequency(s);
  if (direct) return formatFrequency(direct);
  if (s in IMPORT_SYNONYMS) return IMPORT_SYNONYMS[s];
  const n = Number(s);
  if (Number.isInteger(n) && n >= 1 && n <= 7) {
    const f = makeFrequency('week', 1, n);
    return f ? formatFrequency(f) : null;
  }
  return null;
}

/**
 * Map a VisitFrequency onto the existing `weekly|biweekly|monthly` enum used by
 * erp_journey_plans.frequency / the cadence engine (CJ-2). Forward-compatible:
 * annual/custom collapse to the coarsest available bucket (`monthly`) until the
 * richer cadence is wired in FR-6. Pure.
 */
export function frequencyToJourneyEnum(freq: VisitFrequency): 'weekly' | 'biweekly' | 'monthly' {
  const iv = intervalFor(frequencyToVisitsPerWeek(freq));
  if (iv === 'biweekly') return 'biweekly';
  if (iv === 'monthly') return 'monthly';
  return 'weekly'; // 'weekly' and 'multi_weekly' both schedule on weekly days
}
