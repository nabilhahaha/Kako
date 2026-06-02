/** Customer approval — pure helpers (no server-only deps, so unit-testable).
 *  A change to any SENSITIVE field on an APPROVED customer is staged through the
 *  approval workflow; minor fields apply immediately. */

export const SENSITIVE_FIELDS = [
  'cr_number', 'tax_number', 'credit_limit', 'channel_id', 'segment_id', 'classification_id', 'payment_terms_days',
] as const;

const NUMERIC_SENSITIVE = new Set(['credit_limit', 'payment_terms_days']);

/** The sensitive fields whose proposed value differs from the live customer
 *  (returns the proposed new values to stage). */
export function sensitiveChanges(
  next: Record<string, unknown>,
  current: Record<string, unknown>,
): Record<string, unknown> {
  const norm = (v: unknown) => (v === null || v === undefined || v === '' ? '' : String(v));
  const changes: Record<string, unknown> = {};
  for (const f of SENSITIVE_FIELDS) {
    const changed = NUMERIC_SENSITIVE.has(f)
      ? Number(next[f] ?? 0) !== Number(current[f] ?? 0)
      : norm(next[f]) !== norm(current[f]);
    if (changed) changes[f] = next[f];
  }
  return changes;
}
