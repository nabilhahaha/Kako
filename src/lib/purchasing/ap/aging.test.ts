import { describe, it, expect } from 'vitest';
import { ageAp } from './aging';

describe('AP aging', () => {
  const asOf = '2026-03-01';

  it('buckets bills by overdue days from due date', () => {
    const b = ageAp([
      { amount: 100, dueDate: '2026-03-15', docDate: '2026-03-01' }, // not due → current
      { amount: 200, dueDate: '2026-02-20', docDate: '2026-02-01' }, // 9d → 1-30
      { amount: 300, dueDate: '2026-01-20', docDate: '2026-01-01' }, // 40d → 31-60
      { amount: 400, dueDate: '2025-12-20', docDate: '2025-12-01' }, // 71d → 61-90
      { amount: 500, dueDate: '2025-10-01', docDate: '2025-10-01' }, // >90 → 90+
    ], asOf);
    expect(b).toEqual({ current: 100, d1_30: 200, d31_60: 300, d61_90: 400, d90_plus: 500, total: 1500 });
  });

  it('falls back to doc date when due date is absent', () => {
    const b = ageAp([{ amount: 100, docDate: '2026-02-20' }], asOf); // 9d → 1-30
    expect(b.d1_30).toBe(100);
  });

  it('nets payments/returns into the total', () => {
    const b = ageAp([
      { amount: 1000, dueDate: '2026-02-01', docDate: '2026-01-01' },
      { amount: -400, docDate: '2026-02-15' }, // payment
    ], asOf);
    expect(b.total).toBe(600);
    expect(b.d1_30).toBe(1000); // 28d overdue (Feb 1 → Mar 1) → 1-30 bucket; gross aged exposure
  });
});
