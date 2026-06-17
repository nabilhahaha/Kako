import { describe, it, expect } from 'vitest';
import {
  CURRENCIES, vatRateForCountry, currencyOptions, sanitizeTaxNumber, type CountryVat,
} from './finance';

const COUNTRIES: CountryVat[] = [
  { code: 'EG', nameEn: 'Egypt', nameAr: 'مصر', vatRate: 14 },
  { code: 'SA', nameEn: 'Saudi Arabia', nameAr: 'السعودية', vatRate: 15 },
  { code: 'KW', nameEn: 'Kuwait', nameAr: 'الكويت', vatRate: 0 },
];

describe('company finance helpers (pure)', () => {
  it('vatRateForCountry resolves the rate, incl. 0, and null when unknown', () => {
    expect(vatRateForCountry(COUNTRIES, 'EG')).toBe(14);
    expect(vatRateForCountry(COUNTRIES, 'KW')).toBe(0);
    expect(vatRateForCountry(COUNTRIES, 'FR')).toBeNull();
    expect(vatRateForCountry(COUNTRIES, null)).toBeNull();
  });

  it('currencyOptions keeps a known list and injects an unusual saved currency', () => {
    expect(currencyOptions('EGP')).toBe(CURRENCIES); // already known → unchanged ref
    const withCustom = currencyOptions('ZZZ');
    expect(withCustom[0].code).toBe('ZZZ');
    expect(withCustom.length).toBe(CURRENCIES.length + 1);
    expect(currencyOptions(null)).toBe(CURRENCIES);
  });

  it('sanitizeTaxNumber keeps digits only and caps length; empty allowed', () => {
    expect(sanitizeTaxNumber('100-200-300')).toBe('100200300');
    expect(sanitizeTaxNumber('abc')).toBe('');
    expect(sanitizeTaxNumber('1'.repeat(30))).toHaveLength(20);
  });
});
