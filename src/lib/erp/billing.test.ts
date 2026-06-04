import { describe, it, expect } from 'vitest';
import {
  BILLING_CURRENCIES, CURRENCY_CODES, decimalsFor, toMinor, toMajor, formatMoney,
  isCurrency, SUBSCRIPTION_STATUSES, STATUS_LABELS, BILLING_INTERVALS, INTERVAL_LABELS,
} from './billing';

describe('billing currency catalog', () => {
  it('covers the 8 required currencies with ar/en names', () => {
    expect(CURRENCY_CODES.slice().sort()).toEqual(
      ['AED', 'BHD', 'EGP', 'KWD', 'OMR', 'QAR', 'SAR', 'USD'],
    );
    for (const c of BILLING_CURRENCIES) {
      expect(c.en).toBeTruthy();
      expect(c.ar).toBeTruthy();
    }
  });
  it('uses 3 decimals for KWD/BHD/OMR and 2 for the rest', () => {
    expect(decimalsFor('KWD')).toBe(3);
    expect(decimalsFor('BHD')).toBe(3);
    expect(decimalsFor('OMR')).toBe(3);
    expect(decimalsFor('SAR')).toBe(2);
    expect(decimalsFor('EGP')).toBe(2);
    expect(decimalsFor('unknown')).toBe(2); // safe default
  });
  it('isCurrency guards the union', () => {
    expect(isCurrency('SAR')).toBe(true);
    expect(isCurrency('GBP')).toBe(false);
  });
});

describe('money helpers (minor units, currency-aware)', () => {
  it('toMinor rounds to the currency precision', () => {
    expect(toMinor(19.5, 'SAR')).toBe(1950);
    expect(toMinor(1.95, 'KWD')).toBe(1950);   // 3 decimals
    expect(toMinor(0.1 + 0.2, 'USD')).toBe(30); // float-safe rounding
  });
  it('toMajor and toMinor round-trip', () => {
    for (const cur of ['SAR', 'KWD', 'EGP'] as const) {
      expect(toMinor(toMajor(123456, cur), cur)).toBe(123456);
    }
  });
  it('formatMoney respects decimals and currency', () => {
    expect(formatMoney(1950, 'KWD')).toBe('1.950 KWD');
    expect(formatMoney(1950, 'SAR')).toBe('19.50 SAR');
    expect(formatMoney(0, 'EGP')).toBe('0.00 EGP');
    expect(formatMoney(-500, 'USD')).toBe('-5.00 USD');
  });
});

describe('subscription statuses & intervals', () => {
  it('has the five required statuses with labels', () => {
    expect(SUBSCRIPTION_STATUSES).toEqual(['trial', 'active', 'suspended', 'cancelled', 'expired']);
    for (const s of SUBSCRIPTION_STATUSES) {
      expect(STATUS_LABELS[s].en).toBeTruthy();
      expect(STATUS_LABELS[s].ar).toBeTruthy();
    }
  });
  it('supports monthly + yearly with labels', () => {
    expect(BILLING_INTERVALS).toEqual(['monthly', 'yearly']);
    expect(INTERVAL_LABELS.monthly.ar).toBeTruthy();
    expect(INTERVAL_LABELS.yearly.en).toBeTruthy();
  });
});
