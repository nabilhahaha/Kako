// ============================================================================
// Search OS — pure query classification + identifier normalization (V1).
// Deterministic (no NLP/AI). Used to (a) hint the mobile keyboard and (b) feed
// identifier-first matching. The ranking RPC also handles both text+digits, so
// classification is advisory, not authoritative.
// ============================================================================

export type QueryClass = 'barcode' | 'phone' | 'numeric' | 'text' | 'empty';

/** Digits-only view of a query (for phone/barcode/VAT matching, format-agnostic). */
export function digitsOf(q: string): string {
  return (q || '').replace(/\D/g, '');
}

/** Lowercased, trimmed, whitespace-collapsed text form. */
export function normText(q: string): string {
  return (q || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Classify a raw query. Pure. */
export function classifyQuery(q: string): QueryClass {
  const t = (q || '').trim();
  if (!t) return 'empty';
  const digits = digitsOf(t);
  const mostlyDigits = digits.length >= Math.ceil(t.replace(/\s/g, '').length * 0.7);
  if (mostlyDigits) {
    if (digits.length >= 8 && digits.length <= 14) return 'barcode'; // EAN-8..14 / long codes
    if (digits.length >= 6 && digits.length <= 11) return 'phone';   // EG mobile/landline range
    return 'numeric';
  }
  return 'text';
}

/** True when the query should trigger identifier-first matching (numeric-ish). */
export function isIdentifierQuery(q: string): boolean {
  const c = classifyQuery(q);
  return c === 'barcode' || c === 'phone' || c === 'numeric';
}

/** HTML inputmode hint for the search field. */
export function inputModeFor(q: string): 'numeric' | 'text' {
  return isIdentifierQuery(q) ? 'numeric' : 'text';
}

// ── Identifier normalizers (used by providers when projecting documents) ──────

/** Normalize a code/SKU/document-number: trim + lowercase (no separators stripped). */
export function normCode(v: unknown): string | null {
  const s = String(v ?? '').trim().toLowerCase();
  return s || null;
}

/** Normalize a phone to digits only (format-agnostic match). */
export function normPhone(v: unknown): string | null {
  const d = digitsOf(String(v ?? ''));
  return d.length >= 6 ? d : null;
}

/** Phone match variants (covers with/without leading 0 and last-10 national form),
 *  so a query in any common local format hits at least one stored identifier.
 *  (An explicit +country-code query is a known V1 edge — documented.) */
export function phoneVariants(v: unknown): string[] {
  const d = digitsOf(String(v ?? ''));
  if (d.length < 6) return [];
  const out = new Set<string>([d]);
  if (d.startsWith('0')) out.add(d.replace(/^0+/, ''));   // drop leading zero(s)
  if (d.length > 10) out.add(d.slice(-10));               // last-10 national form
  return [...out];
}

/** Normalize a barcode/VAT/CR/tax number to its digit/alnum trimmed form. */
export function normIdentifier(v: unknown): string | null {
  const s = String(v ?? '').trim().toLowerCase().replace(/[\s-]/g, '');
  return s || null;
}

/** Build a de-duplicated identifier list from raw values (drops empties). */
export function buildIdentifiers(values: (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const v of values) { if (v) out.add(v); }
  return [...out];
}
