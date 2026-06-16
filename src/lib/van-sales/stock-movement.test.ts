import { describe, it, expect } from 'vitest';
import { computeStockMovement, stockMovementTotals, classifyMovement, type MovementRow } from './stock-movement';

const DAY = Date.parse('2026-06-16T00:00:00Z');

describe('classifyMovement', () => {
  it('maps movement types to report columns', () => {
    expect(classifyMovement('transfer_in')).toBe('load');
    expect(classifyMovement('purchase_in')).toBe('load');
    expect(classifyMovement('sale_out')).toBe('sales');
    expect(classifyMovement('return_in')).toBe('saleableReturn');
    expect(classifyMovement('adjustment')).toBe('adjustment');
    expect(classifyMovement('unknown')).toBeNull();
  });
});

describe('computeStockMovement', () => {
  // Macrona 400g: opening 500, +100 load, -120 sales, +10 saleable return, current 490.
  const movements: MovementRow[] = [
    { productId: 'p1', movementType: 'transfer_in', quantity: 100, at: '2026-06-16T07:00:00Z' },
    { productId: 'p1', movementType: 'sale_out', quantity: -120, at: '2026-06-16T08:00:00Z' },
    { productId: 'p1', movementType: 'return_in', quantity: 10, at: '2026-06-16T09:00:00Z' },
    // a movement BEFORE the period folds into opening (ignored in columns):
    { productId: 'p1', movementType: 'transfer_in', quantity: 999, at: '2026-06-15T07:00:00Z' },
  ];
  const current = new Map([['p1', 490]]);

  it('explains the current balance (back-computes opening, reconciles)', () => {
    const [row] = computeStockMovement(movements, current, { p1: 'Macrona 400g' }, DAY);
    expect(row).toMatchObject({ name: 'Macrona 400g', load: 100, sales: 120, saleableReturn: 10, damageReturn: 0, expiry: 0, adjustment: 0, current: 490 });
    expect(row.opening).toBe(500); // 490 − (100 − 120 + 10) = 500
    // Formula reconciliation: opening + load − sales + saleableReturn − damage − expiry ± adj === current
    expect(row.opening + row.load - row.sales + row.saleableReturn - row.damageReturn - row.expiry + row.adjustment).toBe(row.current);
  });

  it('is sorted by name and includes SKUs with stock but no period movement', () => {
    const rows = computeStockMovement(
      [{ productId: 'b', movementType: 'sale_out', quantity: -5, at: '2026-06-16T08:00:00Z' }],
      new Map([['a', 30], ['b', 15]]),
      { a: 'Apple', b: 'Banana' }, DAY,
    );
    expect(rows.map((r) => r.name)).toEqual(['Apple', 'Banana']);
    expect(rows[0]).toMatchObject({ name: 'Apple', current: 30, opening: 30, sales: 0 });
  });

  it('totals sum each column', () => {
    const rows = computeStockMovement(movements, current, { p1: 'Macrona 400g' }, DAY);
    const tot = stockMovementTotals(rows);
    expect(tot).toMatchObject({ opening: 500, load: 100, sales: 120, saleableReturn: 10, current: 490 });
  });
});
