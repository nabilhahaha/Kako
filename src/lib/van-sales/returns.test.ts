import { describe, it, expect } from 'vitest';
import { normalizeReturnLines, computeReturnTotal } from './returns';

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
});
