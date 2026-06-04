import { describe, it, expect } from 'vitest';
import {
  buildSchedule, financedAmount, addInterval, planProgress, isOverdue, round2,
} from './installments';

describe('fashion · installments', () => {
  it('financedAmount subtracts the (clamped) down payment from net', () => {
    expect(financedAmount(1000, 300)).toBe(700);
    expect(financedAmount(1000, 0)).toBe(1000);
    expect(financedAmount(1000, 1500)).toBe(0); // down clamped to net
    expect(financedAmount(1000, -50)).toBe(1000); // negative down ignored
  });

  it('buildSchedule splits evenly and the last row absorbs the remainder', () => {
    const rows = buildSchedule(1000, 3, 'monthly', '2026-01-01');
    expect(rows.map((r) => r.amount)).toEqual([333.33, 333.33, 333.34]);
    expect(round2(rows.reduce((s, r) => s + r.amount, 0))).toBe(1000);
    expect(rows.map((r) => r.seqNo)).toEqual([1, 2, 3]);
  });

  it('buildSchedule monthly due dates advance by one month from the start', () => {
    const rows = buildSchedule(900, 3, 'monthly', '2026-01-15');
    expect(rows.map((r) => r.dueDate)).toEqual(['2026-01-15', '2026-02-15', '2026-03-15']);
  });

  it('buildSchedule weekly / biweekly advance by 7 / 14 days', () => {
    expect(buildSchedule(300, 3, 'weekly', '2026-01-01').map((r) => r.dueDate))
      .toEqual(['2026-01-01', '2026-01-08', '2026-01-15']);
    expect(buildSchedule(300, 3, 'biweekly', '2026-01-01').map((r) => r.dueDate))
      .toEqual(['2026-01-01', '2026-01-15', '2026-01-29']);
  });

  it('buildSchedule clamps count to at least 1', () => {
    const rows = buildSchedule(500, 0, 'monthly', '2026-01-01');
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(500);
  });

  it('addInterval crosses a year boundary for monthly', () => {
    expect(addInterval('2026-11-30', 'monthly', 2)).toBe('2027-01-30');
  });

  it('planProgress totals paid / remaining and counts overdue', () => {
    const rows = [
      { amount: 100, paid_amount: 100, due_date: '2026-01-01', status: 'paid' },
      { amount: 100, paid_amount: 40, due_date: '2026-02-01', status: 'partial' },
      { amount: 100, paid_amount: 0, due_date: '2026-03-01', status: 'due' },
    ];
    const p = planProgress(rows, '2026-02-15');
    expect(p.total).toBe(300);
    expect(p.paid).toBe(140);
    expect(p.remaining).toBe(160);
    expect(p.overdueCount).toBe(1); // the Feb 'partial' row is past due, unpaid
  });

  it('isOverdue is false for a paid row even if its date passed', () => {
    expect(isOverdue({ status: 'paid', due_date: '2026-01-01' }, '2026-06-01')).toBe(false);
    expect(isOverdue({ status: 'due', due_date: '2026-01-01' }, '2026-06-01')).toBe(true);
    expect(isOverdue({ status: 'due', due_date: '2026-12-01' }, '2026-06-01')).toBe(false);
  });
});
