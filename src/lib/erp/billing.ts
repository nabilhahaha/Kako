/** ── Billing & Subscriptions — shared types & money helpers ────────────────
 *
 * Core Platform capability (see docs/PRODUCT_PRINCIPLES.md) — multi-currency,
 * GCC-ready. Money is handled in MINOR units (integers) everywhere to avoid
 * float drift; the per-currency decimal count is the single source of truth for
 * conversion + display (KWD/BHD/OMR use 3 decimals, the rest 2).
 */

export const BILLING_CURRENCIES = [
  { code: 'SAR', decimals: 2, en: 'Saudi Riyal', ar: 'ريال سعودي' },
  { code: 'AED', decimals: 2, en: 'UAE Dirham', ar: 'درهم إماراتي' },
  { code: 'KWD', decimals: 3, en: 'Kuwaiti Dinar', ar: 'دينار كويتي' },
  { code: 'QAR', decimals: 2, en: 'Qatari Riyal', ar: 'ريال قطري' },
  { code: 'BHD', decimals: 3, en: 'Bahraini Dinar', ar: 'دينار بحريني' },
  { code: 'OMR', decimals: 3, en: 'Omani Rial', ar: 'ريال عُماني' },
  { code: 'EGP', decimals: 2, en: 'Egyptian Pound', ar: 'جنيه مصري' },
  { code: 'USD', decimals: 2, en: 'US Dollar', ar: 'دولار أمريكي' },
] as const;

export type Currency = (typeof BILLING_CURRENCIES)[number]['code'];
export const CURRENCY_CODES = BILLING_CURRENCIES.map((c) => c.code) as readonly Currency[];

export type BillingInterval = 'monthly' | 'yearly';
export const BILLING_INTERVALS: BillingInterval[] = ['monthly', 'yearly'];
export const INTERVAL_LABELS: Record<BillingInterval, { en: string; ar: string }> = {
  monthly: { en: 'Monthly', ar: 'شهري' },
  yearly: { en: 'Yearly', ar: 'سنوي' },
};

export type SubscriptionStatus = 'trial' | 'active' | 'suspended' | 'cancelled' | 'expired';
export const SUBSCRIPTION_STATUSES: SubscriptionStatus[] = ['trial', 'active', 'suspended', 'cancelled', 'expired'];
export const STATUS_LABELS: Record<SubscriptionStatus, { en: string; ar: string }> = {
  trial: { en: 'Trial', ar: 'تجريبي' },
  active: { en: 'Active', ar: 'نشط' },
  suspended: { en: 'Suspended', ar: 'موقوف' },
  cancelled: { en: 'Cancelled', ar: 'ملغي' },
  expired: { en: 'Expired', ar: 'منتهي' },
};

export function isCurrency(x: string): x is Currency {
  return (CURRENCY_CODES as readonly string[]).includes(x);
}

export function decimalsFor(currency: string): number {
  return BILLING_CURRENCIES.find((c) => c.code === currency)?.decimals ?? 2;
}

/** Major amount (e.g. 19.5) → minor integer (e.g. 1950), currency-aware. */
export function toMinor(amount: number, currency: string): number {
  const f = 10 ** decimalsFor(currency);
  return Math.round(amount * f);
}

/** Minor integer → major number (e.g. 1950 → 19.5), currency-aware. */
export function toMajor(minor: number, currency: string): number {
  return minor / 10 ** decimalsFor(currency);
}

/** Format a minor-unit amount for display, e.g. (1950,'KWD') → "1.950 KWD". */
export function formatMoney(minor: number, currency: string): string {
  const d = decimalsFor(currency);
  const sign = minor < 0 ? '-' : '';
  const v = Math.abs(minor) / 10 ** d;
  return `${sign}${v.toFixed(d)} ${currency}`;
}
