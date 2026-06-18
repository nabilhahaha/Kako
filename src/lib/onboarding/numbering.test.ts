import { describe, it, expect } from 'vitest';
import {
  DOC_TYPE_DEFS, padNumber, previewNumber, nextFromCurrent, currentFromNext,
  sanitizePrefix, isNextNumberAllowed,
} from './numbering';

describe('document numbering helpers (pure)', () => {
  it('padNumber pads to 6 and floors negatives to 0', () => {
    expect(padNumber(1)).toBe('000001');
    expect(padNumber(123456)).toBe('123456');
    expect(padNumber(-5)).toBe('000000');
  });

  it('previewNumber matches the engine format PREFIX-BRANCH-NNNNNN', () => {
    expect(previewNumber('INV', 'CAI', 1)).toBe('INV-CAI-000001');
    expect(previewNumber('SO', 'ALX', 42)).toBe('SO-ALX-000042');
  });

  it('next/current round-trip mirrors the engine increment', () => {
    expect(nextFromCurrent(null)).toBe(1);   // never issued → next is 1
    expect(nextFromCurrent(5)).toBe(6);      // last issued 5 → next is 6
    expect(currentFromNext(6)).toBe(5);      // to issue 6 next, store 5
    expect(currentFromNext(1)).toBe(0);
  });

  it('sanitizePrefix uppercases, strips symbols, caps length', () => {
    expect(sanitizePrefix('inv')).toBe('INV');
    expect(sanitizePrefix('in-v 2!')).toBe('INV2');
    expect(sanitizePrefix('abcdefghijk')).toBe('ABCDEFGH');
  });

  it('isNextNumberAllowed forbids reusing already-issued numbers', () => {
    // never issued (current null): any N ≥ 1 is fine
    expect(isNextNumberAllowed(1, null)).toBe(true);
    expect(isNextNumberAllowed(0, null)).toBe(false);
    // last issued 5 → next must be ≥ 6
    expect(isNextNumberAllowed(6, 5)).toBe(true);   // keep
    expect(isNextNumberAllowed(100, 5)).toBe(true); // skip ahead
    expect(isNextNumberAllowed(5, 5)).toBe(false);  // would reissue 5
    expect(isNextNumberAllowed(3, 5)).toBe(false);  // backwards
  });

  it('DOC_TYPE_DEFS covers the engine document types with default prefixes', () => {
    const keys = DOC_TYPE_DEFS.map((d) => d.key);
    expect(keys).toContain('invoice');
    expect(keys).toContain('collection');
    expect(DOC_TYPE_DEFS.find((d) => d.key === 'invoice')!.defaultPrefix).toBe('INV');
  });
});
