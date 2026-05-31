// ── ETA code tables & numeric helpers ──
// Only the essentials for the common case (VAT-able sales in EGP). The full
// code lists (tax subtypes, units of measure, activity codes) live in the ETA
// SDK; map your catalog/units to them in settings.

/** Value-added tax. ETA models VAT as taxType "T1" with subType "V009". */
export const TAX_TYPE_VAT = 'T1';
export const TAX_SUBTYPE_VAT = 'V009';

/** ETA requires monetary values rounded to 5 decimal places. */
export function round5(n: number): number {
  return Math.round((n + Number.EPSILON) * 1e5) / 1e5;
}

/** ISO-8601 UTC with seconds and a trailing Z, as ETA expects. */
export function etaDateTime(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** A few common ETA units of measure (code → label). Extend as needed; the
 *  authoritative list is published by ETA. Stored per product as eta_unit_type. */
export const ETA_UNIT_TYPES: Record<string, { en: string; ar: string }> = {
  EA: { en: 'Each / Piece', ar: 'قطعة' },
  KGM: { en: 'Kilogram', ar: 'كيلوجرام' },
  GRM: { en: 'Gram', ar: 'جرام' },
  LTR: { en: 'Litre', ar: 'لتر' },
  MTR: { en: 'Metre', ar: 'متر' },
  BX: { en: 'Box', ar: 'علبة' },
  PR: { en: 'Pair', ar: 'زوج' },
  HUR: { en: 'Hour', ar: 'ساعة' },
};
