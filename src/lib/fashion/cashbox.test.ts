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

  it('owner deposit is an inflow, owner withdrawal an outflow', () => {
    const s = cashboxSummary(1000, [
      { kind: 'sale', amount: 2000 },
      { kind: 'owner_deposit', amount: 500 },
      { kind: 'owner_withdrawal', amount: 800 },
      { kind: 'expense', amount: 100 },
    ]);
    expect(s.ownerDeposits).toBe(500);
    expect(s.ownerWithdrawals).toBe(800);
    expect(s.cashSales).toBe(2000);
    expect(s.expenses).toBe(100);
    expect(s.inflows).toBe(2500); // 2000 sale + 500 owner deposit
    expect(s.outflows).toBe(900); // 100 expense + 800 owner withdrawal
    expect(s.expected).toBe(2600); // 1000 + 2500 − 900
  });

  it('applies signed cash adjustments to expected', () => {
    const over = cashboxSummary(0, [{ kind: 'sale', amount: 100 }, { kind: 'adjustment', amount: 25 }]);
    expect(over.adjustments).toBe(25);
    expect(over.expected).toBe(125);
    const under = cashboxSummary(0, [{ kind: 'sale', amount: 100 }, { kind: 'adjustment', amount: -40 }]);
    expect(under.adjustments).toBe(-40);
    expect(under.expected).toBe(60);
  });
});
