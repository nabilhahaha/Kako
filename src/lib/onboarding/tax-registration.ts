/**
 * Tax registrations — pure types + validation (no I/O). Manages rows in the
 * existing `erp_tax_registrations` table. A company's default legal entity is
 * auto-provisioned behind the scenes (reusing `erp_legal_entities`), so a
 * non-technical admin only ever sees "tax registrations" — never "legal
 * entities". No treasury / tax-calculation logic here — registration records only.
 */

export type TaxKind = 'vat' | 'wht' | 'gst' | 'sales_tax';

export const TAX_KINDS: TaxKind[] = ['vat', 'wht', 'gst', 'sales_tax'];

export interface TaxRegistrationInput {
  country: string | null;
  taxKind: string;
  registrationNumber: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
}

/** Validate a registration before save. Returns problem codes (empty = ok). */
export function validateTaxRegistration(input: TaxRegistrationInput): string[] {
  const problems: string[] = [];
  if (!input.country) problems.push('country_required');
  if (!input.registrationNumber || !input.registrationNumber.trim()) problems.push('number_required');
  if (!TAX_KINDS.includes(input.taxKind as TaxKind)) problems.push('bad_kind');
  if (input.effectiveFrom && input.effectiveTo && input.effectiveTo < input.effectiveFrom) {
    problems.push('bad_dates');
  }
  return problems;
}

/** Keep registration numbers tidy (trim, cap length); preserve letters/digits as
 *  some schemes are alphanumeric. */
export function sanitizeRegistrationNumber(raw: string): string {
  return raw.trim().slice(0, 40);
}
