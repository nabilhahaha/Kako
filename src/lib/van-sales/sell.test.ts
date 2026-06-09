import { describe, it, expect } from 'vitest';
import {
  normalizeVanSellLines,
  discountWithinCap,
  firstDiscountOverCap,
  computeVanSellTotals,
} from './sell';

describe('van-sell pure core', () => {
  describe('normalizeVanSellLines', () => {
    it('drops lines without a product or with non-positive quantity', () => {
      const out = normalizeVanSellLines([
        { product_id: 'p1', quantity: 2 },
        { product_id: '', quantity: 5 },
        { product_id: 'p2', quantity: 0 },
        { product_id: 'p3', quantity: -1 },
      ]);
      expect(out.map((l) => l.product_id)).toEqual(['p1']);
    });

    it('defaults discount to 0 and clamps negatives', () => {
      const out = normalizeVanSellLines([
        { product_id: 'p1', quantity: 1 },
        { product_id: 'p2', quantity: 1, discount_pct: -5 },
        { product_id: 'p3', quantity: 1, discount_pct: 10 },
      ]);
      expect(out.map((l) => l.discount_pct)).toEqual([0, 0, 10]);
    });

    it('coerces string-like numerics', () => {
      const out = normalizeVanSellLines([
        // @ts-expect-error — exercise runtime coercion from loosely-typed input
        { product_id: 'p1', quantity: '3', discount_pct: '5' },
      ]);
      expect(out[0]).toEqual({ product_id: 'p1', quantity: 3, discount_pct: 5 });
    });
  });

  describe('discount cap', () => {
    it('treats a null cap as uncapped', () => {
      expect(discountWithinCap(99, null)).toBe(true);
      expect(firstDiscountOverCap([{ product_id: 'p', quantity: 1, discount_pct: 99 }], null)).toBeNull();
    });

    it('allows discounts at or below the cap, rejects above', () => {
      expect(discountWithinCap(10, 10)).toBe(true);
      expect(discountWithinCap(10.5, 10)).toBe(false);
    });

    it('returns the first offending line', () => {
      const over = firstDiscountOverCap(
        [
          { product_id: 'p1', quantity: 1, discount_pct: 5 },
          { product_id: 'p2', quantity: 1, discount_pct: 25 },
          { product_id: 'p3', quantity: 1, discount_pct: 30 },
        ],
        20,
      );
      expect(over?.product_id).toBe('p2');
    });
  });

  describe('computeVanSellTotals', () => {
    it('matches the shared sales-calc math (net = gross − discount + tax)', () => {
      // 2 × 100 = 200 gross; 10% discount = 20; net 180; 14% tax on 180 = 25.2
      const totals = computeVanSellTotals([
        { product_id: 'p1', quantity: 2, unit_price: 100, discount_pct: 10, tax_rate: 14 },
      ]);
      expect(totals).toEqual({
        total_amount: 200,
        discount_amount: 20,
        tax_amount: 25.2,
        net_amount: 205.2,
      });
    });

    it('sums multiple lines', () => {
      const totals = computeVanSellTotals([
        { product_id: 'p1', quantity: 1, unit_price: 50, discount_pct: 0, tax_rate: 0 },
        { product_id: 'p2', quantity: 3, unit_price: 10, discount_pct: 0, tax_rate: 0 },
      ]);
      expect(totals.total_amount).toBe(80);
      expect(totals.net_amount).toBe(80);
    });
  });
});
