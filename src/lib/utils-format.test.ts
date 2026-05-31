/**
 * Additional unit tests for the pure formatting helpers in utils.ts.
 * (ageFromBirthDate and formatNumber are already covered in utils.test.ts.)
 */
import { describe, it, expect } from 'vitest';
import { formatCurrency, formatDate, formatNumber, initialsFromName } from './utils';

// ─── formatCurrency ──────────────────────────────────────────────────────────

describe('formatCurrency', () => {
  it('returns a non-empty string for a positive value', () => {
    const result = formatCurrency(1234.56);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('treats null/undefined as zero and returns the currency formatted zero', () => {
    // Both null and undefined should equal each other (both coerce to 0)
    expect(formatCurrency(null)).toBe(formatCurrency(0));
    expect(formatCurrency(undefined)).toBe(formatCurrency(0));
  });

  it('accepts a string numeric value', () => {
    const fromString = formatCurrency('500');
    const fromNumber = formatCurrency(500);
    expect(fromString).toBe(fromNumber);
  });

  it('does not throw for large numbers', () => {
    expect(() => formatCurrency(9_999_999.99)).not.toThrow();
  });

  it('does not throw for negative values', () => {
    expect(() => formatCurrency(-100)).not.toThrow();
  });

  it('respects a different locale without throwing', () => {
    expect(() => formatCurrency(100, 'EGP', 'en-US')).not.toThrow();
    expect(() => formatCurrency(100, 'SAR', 'ar-SA')).not.toThrow();
  });

  it('respects a different currency without throwing', () => {
    expect(() => formatCurrency(100, 'USD', 'en-US')).not.toThrow();
  });

  it('output for en-US locale contains the numeric digits', () => {
    // With en-US we can safely assert the digits appear somewhere in the output
    const result = formatCurrency(1234, 'EGP', 'en-US');
    expect(result).toMatch(/1[,.]?234/);
  });
});

// ─── formatNumber ────────────────────────────────────────────────────────────

describe('formatNumber (additional)', () => {
  it('returns a string for integer input', () => {
    expect(typeof formatNumber(42)).toBe('string');
  });

  it('returns a string for zero', () => {
    expect(typeof formatNumber(0)).toBe('string');
  });

  it('treats null as 0', () => {
    expect(formatNumber(null)).toBe(formatNumber(0));
  });

  it('accepts a string numeric value', () => {
    expect(formatNumber('99')).toBe(formatNumber(99));
  });

  it('en-US output for 1000 contains "1,000"', () => {
    expect(formatNumber(1000, 'en-US')).toBe('1,000');
  });

  it('does not throw for negative numbers', () => {
    expect(() => formatNumber(-500)).not.toThrow();
  });
});

// ─── formatDate ──────────────────────────────────────────────────────────────

describe('formatDate', () => {
  it('returns the em-dash placeholder for null input', () => {
    expect(formatDate(null)).toBe('—');
  });

  it('returns the em-dash placeholder for undefined input', () => {
    expect(formatDate(undefined)).toBe('—');
  });

  it('returns the em-dash placeholder for an empty string', () => {
    expect(formatDate('')).toBe('—');
  });

  it('returns the em-dash placeholder for an invalid date string', () => {
    expect(formatDate('not-a-date')).toBe('—');
  });

  it('returns a non-empty, non-dash string for a valid ISO date string', () => {
    const result = formatDate('2024-06-15');
    expect(result).not.toBe('—');
    expect(result.length).toBeGreaterThan(0);
  });

  it('accepts a Date object and returns a formatted string', () => {
    const result = formatDate(new Date('2024-01-01T00:00:00Z'));
    expect(result).not.toBe('—');
    expect(typeof result).toBe('string');
  });

  it('does not throw for a far-future date', () => {
    expect(() => formatDate('2099-12-31')).not.toThrow();
  });

  it('does not throw for a historical date', () => {
    expect(() => formatDate('1900-01-01')).not.toThrow();
  });

  it('respects a non-default locale without throwing', () => {
    expect(() => formatDate('2024-06-15', 'en-US')).not.toThrow();
    const result = formatDate('2024-06-15', 'en-US');
    expect(result).not.toBe('—');
  });

  it('en-US output for 2024-06-15 contains the year 2024', () => {
    const result = formatDate('2024-06-15', 'en-US');
    expect(result).toContain('2024');
  });
});

// ─── initialsFromName ────────────────────────────────────────────────────────

describe('initialsFromName', () => {
  it('returns the Arabic question mark for null', () => {
    expect(initialsFromName(null)).toBe('؟');
  });

  it('returns the Arabic question mark for undefined', () => {
    expect(initialsFromName(undefined)).toBe('؟');
  });

  it('returns the Arabic question mark for empty string', () => {
    expect(initialsFromName('')).toBe('؟');
  });

  it('returns up to 2 chars from a single word', () => {
    expect(initialsFromName('Ahmed')).toBe('AH');
  });

  it('returns first + last initial for a two-word name', () => {
    expect(initialsFromName('Ahmed Ali')).toBe('AA');
  });

  it('returns first + last initial for a three-word name', () => {
    expect(initialsFromName('Ahmed Mohamed Ali')).toBe('AA');
  });

  it('returns uppercase initials', () => {
    const result = initialsFromName('john doe');
    expect(result).toBe(result.toUpperCase());
  });
});
