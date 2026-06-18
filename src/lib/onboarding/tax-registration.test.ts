import { describe, it, expect } from 'vitest';
import {
  TAX_KINDS, validateTaxRegistration, sanitizeRegistrationNumber, type TaxRegistrationInput,
} from './tax-registration';

const base: TaxRegistrationInput = {
  country: 'EG', taxKind: 'vat', registrationNumber: '100200300', effectiveFrom: null, effectiveTo: null,
};

describe('tax-registration pure helpers', () => {
  it('accepts a valid registration', () => {
    expect(validateTaxRegistration(base)).toEqual([]);
  });

  it('requires country, number, and a known kind', () => {
    expect(validateTaxRegistration({ ...base, country: null })).toContain('country_required');
    expect(validateTaxRegistration({ ...base, registrationNumber: '   ' })).toContain('number_required');
    expect(validateTaxRegistration({ ...base, taxKind: 'bogus' })).toContain('bad_kind');
  });

  it('rejects effective_to before effective_from', () => {
    expect(validateTaxRegistration({ ...base, effectiveFrom: '2026-06-01', effectiveTo: '2026-05-01' }))
      .toContain('bad_dates');
    expect(validateTaxRegistration({ ...base, effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31' }))
      .toEqual([]);
  });

  it('sanitizeRegistrationNumber trims and caps to 40 (keeps alphanumerics)', () => {
    expect(sanitizeRegistrationNumber('  AB-123  ')).toBe('AB-123');
    expect(sanitizeRegistrationNumber('9'.repeat(50))).toHaveLength(40);
  });

  it('TAX_KINDS covers vat', () => {
    expect(TAX_KINDS).toContain('vat');
  });
});
