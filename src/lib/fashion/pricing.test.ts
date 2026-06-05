import { describe, it, expect } from 'vitest';
import { variantUnitPrice, lineTotal, cartTotals, lineProfit } from './pricing';

describe('fashion · pricing', () => {
  it('variantUnitPrice picks cash vs installment, falling back to cash', () => {
    const v = { cash_price: 120, installment_price: 150 };
    expect(variantUnitPrice(v, 'cash')).toBe(120);
    expect(variantUnitPrice(v, 'installment')).toBe(150);
    // no installment price configured → fall back to cash
    expect(variantUnitPrice({ cash_price: 120, installment_price: 0 }, 'installment')).toBe(120);
  });

  it('lineTotal applies the line discount percentage', () => {
    expect(lineTotal({ product_id: 'p', quantity: 2, unit_price: 100 })).toBe(200);
    expect(lineTotal({ product_id: 'p', quantity: 2, unit_price: 100, discount_pct: 10 })).toBe(180);
  });

  it('cartTotals sums lines and clamps the header discount to the subtotal', () => {
    const lines = [
      { product_id: 'a', quantity: 1, unit_price: 120 },
      { product_id: 'b', quantity: 2, unit_price: 90, discount_pct: 50 },
    ];
    expect(cartTotals(lines)).toEqual({ total: 210, discount: 0, net: 210 });
    expect(cartTotals(lines, 30)).toEqual({ total: 210, discount: 30, net: 180 });
    // over-large discount is clamped to the subtotal → net never goes below 0
    expect(cartTotals(lines, 999)).toEqual({ total: 210, discount: 210, net: 0 });
  });

  it('lineProfit nets cost out of the discounted line revenue', () => {
    expect(lineProfit({ product_id: 'p', quantity: 2, unit_price: 100, cost_price: 60 })).toBe(80);
    expect(lineProfit({ product_id: 'p', quantity: 1, unit_price: 100, discount_pct: 10, cost_price: 60 })).toBe(30);
  });
});
