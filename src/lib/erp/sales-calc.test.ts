import { describe, it, expect } from 'vitest';
import { computeLine, computeTotals } from './sales-calc';

describe('computeLine', () => {
  it('applies discount then tax on the net', () => {
    const r = computeLine({ product_id: 'p', quantity: 2, unit_price: 100, discount_pct: 10, tax_rate: 14 });
    expect(r.gross).toBe(200);
    expect(r.discount).toBe(20);
    expect(r.net).toBe(180);
    expect(r.tax).toBe(25.2);
  });

  it('handles zero discount/tax', () => {
    const r = computeLine({ product_id: 'p', quantity: 3, unit_price: 33.5, discount_pct: 0, tax_rate: 0 });
    expect(r.gross).toBe(100.5);
    expect(r.discount).toBe(0);
    expect(r.net).toBe(100.5);
    expect(r.tax).toBe(0);
  });
});

describe('computeTotals', () => {
  it('sums lines into a balanced document total', () => {
    const t = computeTotals([
      { product_id: 'a', quantity: 2, unit_price: 100, discount_pct: 10, tax_rate: 14 }, // net 180, tax 25.2
      { product_id: 'b', quantity: 1, unit_price: 50, discount_pct: 0, tax_rate: 0 }, // net 50
    ]);
    expect(t.total_amount).toBe(250);
    expect(t.discount_amount).toBe(20);
    expect(t.tax_amount).toBe(25.2);
    expect(t.net_amount).toBe(255.2); // 250 - 20 + 25.2
  });

  it('is zero for an empty document', () => {
    expect(computeTotals([])).toEqual({ total_amount: 0, discount_amount: 0, tax_amount: 0, net_amount: 0 });
  });
});
