import { describe, it, expect } from 'vitest';
import { ageFromBirthDate, formatNumber, chunk } from './utils';

describe('chunk — batches large id lists for PostgREST .in() (bulk-assign Bad Request fix)', () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `id-${i}`);

  it('1000 ids split into 10 batches of 100, every id covered exactly once, order preserved', () => {
    const batches = chunk(ids(1000));
    expect(batches).toHaveLength(10);
    expect(batches.every((b) => b.length <= 100)).toBe(true);
    const flat = batches.flat();
    expect(flat).toHaveLength(1000);
    expect(new Set(flat).size).toBe(1000);          // no dupes / drops
    expect(flat).toEqual(ids(1000));                // order preserved
  });

  it('handles the required sizes (10 / 100 / 500 / 1000) with no batch over the limit', () => {
    for (const n of [10, 100, 500, 1000]) {
      const batches = chunk(ids(n));
      expect(batches.flat()).toHaveLength(n);
      expect(batches.every((b) => b.length <= 100 && b.length > 0)).toBe(true);
    }
  });

  it('small lists stay a single batch (unchanged behavior for ≤100)', () => {
    expect(chunk(ids(10))).toHaveLength(1);
    expect(chunk(ids(100))).toHaveLength(1);
    expect(chunk(ids(101))).toHaveLength(2);
  });

  it('empty input yields no batches; size is clamped to ≥1', () => {
    expect(chunk([])).toEqual([]);
    expect(chunk(ids(3), 0)).toHaveLength(3);        // size 0 → 1 per batch, no infinite loop
  });
});

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
