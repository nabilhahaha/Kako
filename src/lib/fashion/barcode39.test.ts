/** Unit tests for the pure Code 39 encoder (barcode39.ts). */
import { describe, it, expect } from 'vitest';
import { sanitizeCode39, code39Bars, code39Width } from './barcode39';

describe('sanitizeCode39', () => {
  it('upper-cases and keeps Code 39 characters', () => {
    expect(sanitizeCode39('inv-2026/001')).toBe('INV-2026/001');
  });
  it('drops unsupported characters', () => {
    expect(sanitizeCode39('a*b@c#')).toBe('ABC'); // * @ # removed
  });
});

describe('code39Bars', () => {
  it('wraps the payload in the * start/stop sentinels', () => {
    // empty payload → just *<gap>* : 9 + 1 + 9 = 19 elements
    expect(code39Bars('')).toHaveLength(19);
  });

  it('encodes each glyph as 9 elements plus inter-character gaps', () => {
    // '*' + gap + 'A' + gap + '*' = 9+1+9+1+9 = 29
    expect(code39Bars('A')).toHaveLength(29);
  });

  it('starts and ends on a bar (sentinel bars frame the symbol)', () => {
    const els = code39Bars('123');
    expect(els[0].bar).toBe(true);
    expect(els[els.length - 1].bar).toBe(true);
  });

  it('alternates bar/space within a glyph', () => {
    const els = code39Bars('A');
    expect(els.slice(0, 9).map((e) => e.bar)).toEqual([true, false, true, false, true, false, true, false, true]);
  });

  it('honours the wide multiplier', () => {
    const narrow = code39Width(code39Bars('CODE39', 2));
    const wider = code39Width(code39Bars('CODE39', 4));
    expect(wider).toBeGreaterThan(narrow);
  });
});

describe('code39Width', () => {
  it('sums element widths', () => {
    expect(code39Width([{ bar: true, width: 1 }, { bar: false, width: 3 }])).toBe(4);
  });
});
