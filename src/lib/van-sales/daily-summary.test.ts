import { describe, it, expect } from 'vitest';
import { computeDailySummary, rankSalesmen, type DailySummaryInput, type SalesmanDay } from './daily-summary';

const base: DailySummaryInput = {
  dayOpenedAt: '2026-06-16T06:00:00Z',
  dayClosedAt: null,
  nowIso: '2026-06-16T10:00:00Z',
  outcomes: [
    { kind: 'new_sale', customerId: 'c1', at: '2026-06-16T07:00:00Z' },
    { kind: 'collection', customerId: 'c2', at: '2026-06-16T07:30:00Z' },
    { kind: 'no_sale', customerId: 'c3', at: '2026-06-16T08:00:00Z' },
    { kind: 'no_sale', customerId: 'c3', at: '2026-06-16T09:30:00Z' }, // repeat no-sale, c3
    { kind: 'return', customerId: 'c1', at: '2026-06-16T07:05:00Z' },
  ],
  invoices: [{ amount: 100, at: '2026-06-16T07:00:00Z' }, { amount: 50.5, at: '2026-06-16T07:02:00Z' }],
  collections: [{ amount: 80, at: '2026-06-16T07:30:00Z' }],
  returns: [{ at: '2026-06-16T07:05:00Z' }],
};

describe('computeDailySummary', () => {
  it('is LIVE while the day is open', () => {
    expect(computeDailySummary(base).open).toBe(true);
    expect(computeDailySummary({ ...base, dayClosedAt: '2026-06-16T15:00:00Z' }).open).toBe(false);
  });

  it('counts visits + customers + per-outcome breakdown', () => {
    const s = computeDailySummary(base);
    expect(s.visits).toBe(5);
    expect(s.customersVisited).toBe(3);       // c1, c2, c3
    expect(s.salesVisits).toBe(1);
    expect(s.collectionVisits).toBe(1);
    expect(s.returnVisits).toBe(1);
    expect(s.noSaleVisits).toBe(2);
    expect(s.salesCustomers).toBe(1);
    expect(s.noSaleCustomers).toBe(1);        // only c3
  });

  it('sums amounts + counts transactions', () => {
    const s = computeDailySummary(base);
    expect(s.salesAmount).toBe(150.5);
    expect(s.collectionAmount).toBe(80);
    expect(s.invoiceCount).toBe(2);
    expect(s.collectionCount).toBe(1);
    expect(s.returnCount).toBe(1);
  });

  it('flags repeat no-sale customers (≥2)', () => {
    expect(computeDailySummary(base).noSaleRepeatCustomers).toBe(1); // c3 twice
  });

  it('computes first/last activity + longest gap (approx idle)', () => {
    const s = computeDailySummary(base);
    expect(s.firstActivityAt).toBe('2026-06-16T07:00:00.000Z');
    expect(s.lastActivityAt).toBe('2026-06-16T09:30:00.000Z');
    expect(s.longestGapMinutes).toBe(90); // 08:00 → 09:30
  });

  it('handles an empty day', () => {
    const s = computeDailySummary({ ...base, outcomes: [], invoices: [], collections: [], returns: [] });
    expect(s.visits).toBe(0);
    expect(s.firstActivityAt).toBeNull();
    expect(s.lastActivityAt).toBeNull();
    expect(s.longestGapMinutes).toBeNull();
    expect(s.salesAmount).toBe(0);
  });
});

describe('rankSalesmen', () => {
  const mk = (id: string, salesAmount: number, visits: number, collectionAmount: number): SalesmanDay => ({
    salesmanId: id, name: id,
    summary: { ...computeDailySummary(base), salesAmount, visits, collectionAmount },
  });
  const rows = [mk('a', 100, 5, 30), mk('b', 300, 2, 90), mk('c', 200, 9, 10)];

  it('ranks by sales value desc', () => {
    expect(rankSalesmen(rows, 'salesAmount').map((r) => r.salesmanId)).toEqual(['b', 'c', 'a']);
  });
  it('ranks by visits desc', () => {
    expect(rankSalesmen(rows, 'visits').map((r) => r.salesmanId)).toEqual(['c', 'a', 'b']);
  });
  it('ranks by collections value desc', () => {
    expect(rankSalesmen(rows, 'collectionAmount').map((r) => r.salesmanId)).toEqual(['b', 'a', 'c']);
  });
  it('does not mutate the input', () => {
    const copy = [...rows];
    rankSalesmen(rows, 'salesAmount');
    expect(rows).toEqual(copy);
  });
});
