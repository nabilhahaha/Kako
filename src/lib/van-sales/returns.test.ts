import { describe, it, expect } from 'vitest';
import { normalizeReturnLines, computeReturnTotal, buildReturnReviewRows } from './returns';

describe('van-return pure core', () => {
  describe('normalizeReturnLines', () => {
    it('drops lines without a product or with non-positive quantity', () => {
      const out = normalizeReturnLines([
        { product_id: 'p1', quantity: 2 },
        { product_id: '', quantity: 5 },
        { product_id: 'p2', quantity: 0 },
        { product_id: 'p3', quantity: -3 },
      ]);
      expect(out).toEqual([{ product_id: 'p1', quantity: 2 }]);
    });

    it('coerces string-like quantities', () => {
      const out = normalizeReturnLines([
        // @ts-expect-error — exercise runtime coercion from loosely-typed input
        { product_id: 'p1', quantity: '4' },
      ]);
      expect(out[0]).toEqual({ product_id: 'p1', quantity: 4 });
    });
  });

  describe('computeReturnTotal', () => {
    it('sums round2(qty × price) per line', () => {
      const total = computeReturnTotal([
        { product_id: 'p1', quantity: 2, unit_price: 100 },
        { product_id: 'p2', quantity: 3, unit_price: 10.5 },
      ]);
      expect(total).toBe(231.5); // 200 + 31.5
    });

    it('rounds each line before summing (not the raw sum)', () => {
      // Per line: round2(0.014) = 0.01 each → 0.02. Without per-line rounding the
      // raw sum 0.028 would round to 0.03 — so this proves the per-line rounding.
      const total = computeReturnTotal([
        { product_id: 'p1', quantity: 1, unit_price: 0.014 },
        { product_id: 'p2', quantity: 1, unit_price: 0.014 },
      ]);
      expect(total).toBe(0.02);
    });

    it('is zero for no lines', () => {
      expect(computeReturnTotal([])).toBe(0);
    });
  });

  // Regression: the Review panel must ALWAYS show every selected item. The screen
  // builds its review rows from the server-priced preview lines via this helper —
  // if it ever returns fewer rows than priced lines, items would vanish from the
  // review (the reported bug).
  describe('buildReturnReviewRows (return review)', () => {
    const priced = [
      { product_id: 'p1', quantity: 2, unit_price: 100 },
      { product_id: 'p2', quantity: 3, unit_price: 10.5 },
    ];
    it('returns exactly one row per priced line — items never disappear', () => {
      const rows = buildReturnReviewRows(priced, { p1: 'Cola 30', p2: 'Water 12' });
      expect(rows).toHaveLength(priced.length);
      expect(rows.map((r) => r.product_id)).toEqual(['p1', 'p2']);
    });
    it('resolves the display name and computes the line total', () => {
      const rows = buildReturnReviewRows(priced, { p1: 'Cola 30', p2: 'Water 12' });
      expect(rows[0]).toEqual({ product_id: 'p1', name: 'Cola 30', quantity: 2, unitPrice: 100, lineTotal: 200 });
      expect(rows[1].lineTotal).toBe(31.5);
    });
    it('falls back to the product id when a name is missing', () => {
      const rows = buildReturnReviewRows([{ product_id: 'pX', quantity: 1, unit_price: 5 }], {});
      expect(rows[0].name).toBe('pX');
    });
    it('is empty for no priced lines', () => {
      expect(buildReturnReviewRows([], { p1: 'x' })).toEqual([]);
    });
  });
});
