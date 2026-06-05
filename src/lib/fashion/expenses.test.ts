/** Unit tests for the pure expense helpers (expenses.ts). */
import { describe, it, expect } from 'vitest';
import { EXPENSE_CATEGORIES, expenseCategoryLabel, summarizeExpenses, netCashAfterExpenses } from './expenses';

describe('expense categories', () => {
  it('exposes the fixed bilingual set including rent and other', () => {
    const values = EXPENSE_CATEGORIES.map((c) => c.value);
    expect(values).toContain('rent');
    expect(values).toContain('salaries');
    expect(values).toContain('other');
  });
  it('localizes a known category and falls back for unknown', () => {
    expect(expenseCategoryLabel('rent', 'en')).toBe('Rent');
    expect(expenseCategoryLabel('rent', 'ar')).toBe('إيجار');
    expect(expenseCategoryLabel('mystery', 'en')).toBe('mystery');
    expect(expenseCategoryLabel(null, 'en')).toBe('—');
  });
});

describe('summarizeExpenses', () => {
  const rows = [
    { category: 'rent', amount: 1000, expense_date: '2026-06-01' },
    { category: 'electricity', amount: 200, expense_date: '2026-06-01' },
    { category: 'rent', amount: 500, expense_date: '2026-06-02' },
    { category: null, amount: 50, expense_date: '2026-06-02' },
  ];

  it('totals all expenses and counts rows', () => {
    const s = summarizeExpenses(rows);
    expect(s.total).toBe(1750);
    expect(s.count).toBe(4);
  });

  it('groups by category, most expensive first, null → other', () => {
    const s = summarizeExpenses(rows);
    expect(s.byCategory[0]).toEqual({ category: 'rent', total: 1500, count: 2 });
    expect(s.byCategory.find((c) => c.category === 'other')).toEqual({ category: 'other', total: 50, count: 1 });
  });

  it('groups by day', () => {
    const s = summarizeExpenses(rows);
    const d1 = s.byDay.find((d) => d.day === '2026-06-01');
    expect(d1?.total).toBe(1200);
  });

  it('handles an empty list', () => {
    expect(summarizeExpenses([])).toEqual({ total: 0, count: 0, byCategory: [], byDay: [] });
  });
});

describe('netCashAfterExpenses', () => {
  it('subtracts cash expenses from cash sales', () => {
    expect(netCashAfterExpenses(5000, 1200)).toBe(3800);
  });
});
