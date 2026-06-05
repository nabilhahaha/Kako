import { describe, it, expect } from 'vitest';
import { cashboxSummary, cashVariance } from './cashbox';

describe('fashion · cashbox', () => {
  it('expected = opening + inflows − outflows', () => {
    const s = cashboxSummary(500, [
      { kind: 'sale', amount: 1200 },
      { kind: 'collection', amount: 300 },
      { kind: 'expense', amount: 150 },
      { kind: 'supplier_payment', amount: 400 },
    ]);
    expect(s.inflows).toBe(1500);
    expect(s.outflows).toBe(550);
    expect(s.expected).toBe(1450); // 500 + 1500 − 550
  });

  it('variance flags over and short', () => {
    expect(cashVariance(1450, 1450)).toBe(0);
    expect(cashVariance(1500, 1450)).toBe(50); // over
    expect(cashVariance(1400, 1450)).toBe(-50); // short
  });
});
