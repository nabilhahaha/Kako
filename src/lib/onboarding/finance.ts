/**
 * Company finance setup — pure types + helpers (no I/O). Configures the
 * company-level Country / Currency / Tax number on `erp_companies` and surfaces
 * the standard VAT rate for the chosen country from the `erp_country_vat`
 * reference table. This is configuration only — no treasury / posting / tax
 * calculation logic is touched here.
 */

export interface CountryVat {
  code: string;       // erp_country_vat.country (ISO-2)
  nameEn: string;
  nameAr: string;
  vatRate: number;    // standard VAT %, e.g. 14
}

export interface CurrencyDef {
  code: string;       // ISO-4217
  nameEn: string;
  nameAr: string;
}

/** Common currencies for the region (the company's existing value is always
 *  kept selectable even if not in this list). */
export const CURRENCIES: CurrencyDef[] = [
  { code: 'EGP', nameEn: 'Egyptian Pound', nameAr: 'جنيه مصري' },
  { code: 'SAR', nameEn: 'Saudi Riyal', nameAr: 'ريال سعودي' },
  { code: 'AED', nameEn: 'UAE Dirham', nameAr: 'درهم إماراتي' },
  { code: 'KWD', nameEn: 'Kuwaiti Dinar', nameAr: 'دينار كويتي' },
  { code: 'QAR', nameEn: 'Qatari Riyal', nameAr: 'ريال قطري' },
  { code: 'BHD', nameEn: 'Bahraini Dinar', nameAr: 'دينار بحريني' },
  { code: 'OMR', nameEn: 'Omani Rial', nameAr: 'ريال عُماني' },
  { code: 'USD', nameEn: 'US Dollar', nameAr: 'دولار أمريكي' },
];

/** Standard VAT rate for a country code, or null if unknown. */
export function vatRateForCountry(countries: CountryVat[], code: string | null): number | null {
  if (!code) return null;
  const c = countries.find((x) => x.code === code);
  return c ? c.vatRate : null;
}

/** Merge the company's current currency into the known list so an unusual saved
 *  value is never silently dropped from the picker. */
export function currencyOptions(current: string | null): CurrencyDef[] {
  if (current && !CURRENCIES.some((c) => c.code === current)) {
    return [{ code: current, nameEn: current, nameAr: current }, ...CURRENCIES];
  }
  return CURRENCIES;
}

/** Tax/VAT registration numbers are digits (most GCC/EG schemes); keep digits
 *  only and cap to a sane length. Empty is allowed (not yet registered). */
export function sanitizeTaxNumber(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 20);
}
