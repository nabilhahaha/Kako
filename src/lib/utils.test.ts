import { describe, it, expect } from 'vitest';
import { ageFromBirthDate, formatNumber } from './utils';

describe('ageFromBirthDate', () => {
  it('computes whole years for a birthday already passed this year', () => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 30);
    d.setDate(d.getDate() - 1); // ensure the birthday has passed
    expect(ageFromBirthDate(d)).toBe(30);
  });
  it('returns null for missing or invalid input', () => {
    expect(ageFromBirthDate(null)).toBeNull();
    expect(ageFromBirthDate('not-a-date')).toBeNull();
  });
});

describe('formatNumber', () => {
  it('formats numbers and tolerates null', () => {
    expect(typeof formatNumber(1234.5)).toBe('string');
    expect(formatNumber(null)).toBe(formatNumber(0));
  });
});
