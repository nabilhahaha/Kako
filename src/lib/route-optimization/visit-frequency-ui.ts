/**
 * Visit-frequency presentation helpers (FR-3) — pure. Maps a frequency source to
 * its i18n key + Badge variant, and renders a VisitFrequency to a display label.
 * One source of truth so every surface (Customer 360, form, future Studio) shows
 * frequency + provenance identically.
 */
import { formatFrequency, type VisitFrequency } from './visit-frequency';
import type { FrequencySource } from './frequency-resolver';

type BadgeVariant = 'success' | 'info' | 'secondary' | 'warning' | 'outline';

/** Frequency source → i18n key (under the `visitFreq` namespace). */
export const FREQUENCY_SOURCE_KEY: Record<FrequencySource, string> = {
  manual: 'visitFreq.srcManual',
  import: 'visitFreq.srcImport',
  planning: 'visitFreq.srcPlanning',
  classification: 'visitFreq.srcClassification',
  system: 'visitFreq.srcSystem',
};

/** Frequency source → Badge variant. */
export const FREQUENCY_SOURCE_VARIANT: Record<FrequencySource, BadgeVariant> = {
  manual: 'success',
  import: 'info',
  planning: 'secondary',
  classification: 'warning',
  system: 'outline',
};

/** The friendly cadence options offered in the form (canonical tokens). */
export const FREQUENCY_OPTIONS: { token: string; key: string }[] = [
  { token: 'weekly', key: 'visitFreq.weekly' },
  { token: 'biweekly', key: 'visitFreq.biweekly' },
  { token: 'monthly', key: 'visitFreq.monthly' },
  { token: 'annual', key: 'visitFreq.annual' },
];

/**
 * Render a VisitFrequency to a localized display label. Friendly aliases
 * (weekly/biweekly/monthly/annual) use their i18n string; multi-visit weekly
 * cadences read "3× Weekly"; anything else falls back to the canonical token.
 */
export function frequencyLabel(freq: VisitFrequency, t: (k: string, vars?: Record<string, string | number>) => string): string {
  const tok = formatFrequency(freq);
  if (tok === 'weekly' || tok === 'biweekly' || tok === 'monthly' || tok === 'annual') return t(`visitFreq.${tok}`);
  // Multi-visit weekly cadence (e.g. A-grade 3/week) → "3× Weekly".
  if (freq.unit === 'week' && freq.visitsPerCycle > 1 && freq.everyN === 1) {
    return t('visitFreq.perCycle', { n: freq.visitsPerCycle, unit: t('visitFreq.weekly') });
  }
  // FR-6 custom cadence: "every N weeks/months/years".
  if (freq.visitsPerCycle === 1 && freq.everyN > 1) {
    const key = freq.unit === 'week' ? 'visitFreq.everyNWeeks' : freq.unit === 'month' ? 'visitFreq.everyNMonths' : 'visitFreq.everyNYears';
    return t(key, { n: freq.everyN });
  }
  return tok;
}
