import 'server-only';

/** ── Field capture helpers (FE-4a) ──────────────────────────────────────────
 *  Capture kinds and the simple field-based execution score. Weighted scoring
 *  is deferred to FE-5; for now the score is read from a designated numeric
 *  field (default `score`) when present. */

export const CAPTURE_KINDS = ['merchandising', 'competitor', 'survey', 'out_of_stock', 'opportunity', 'quick'] as const;
export type CaptureKind = (typeof CAPTURE_KINDS)[number];

/** Map a seeded capture form key to its kind (used by the rep launcher). */
export const CAPTURE_FORM_KINDS: Record<string, CaptureKind> = {
  fe_merchandising_audit: 'merchandising',
  fe_competitor_capture: 'competitor',
  fe_store_checklist: 'survey',
  fe_out_of_stock: 'out_of_stock',
  fe_opportunity: 'opportunity',
  fe_complaint: 'quick',
};

export function captureKindFor(formKey: string): CaptureKind {
  return CAPTURE_FORM_KINDS[formKey] ?? 'quick';
}

/** Simple, field-based score: the value of `scoreField` if numeric, else null. */
export function captureScore(values: Record<string, unknown>, scoreField = 'score'): number | null {
  const v = values[scoreField];
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}
