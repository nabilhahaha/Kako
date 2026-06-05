/** Fashion pack — expense categories + report aggregation (pure, no DB). */

import { round2 } from './installments';

export interface BilingualOption {
  value: string;
  ar: string;
  en: string;
}

/** Fixed expense categories for the fashion store (bilingual constant — no table). */
export const EXPENSE_CATEGORIES: BilingualOption[] = [
  { value: 'rent', ar: 'إيجار', en: 'Rent' },
  { value: 'electricity', ar: 'كهرباء', en: 'Electricity' },
  { value: 'internet', ar: 'إنترنت', en: 'Internet' },
  { value: 'salaries', ar: 'رواتب', en: 'Salaries' },
  { value: 'delivery', ar: 'توصيل', en: 'Delivery' },
  { value: 'packaging', ar: 'تغليف', en: 'Packaging' },
  { value: 'maintenance', ar: 'صيانة', en: 'Maintenance' },
  { value: 'supplier', ar: 'مصروف مورّد', en: 'Supplier-related' },
  { value: 'other', ar: 'أخرى', en: 'Other' },
];

export function expenseCategoryLabel(value: string | null | undefined, locale: 'ar' | 'en'): string {
  const found = EXPENSE_CATEGORIES.find((c) => c.value === value);
  return found ? found[locale] : (value || '—');
}

export interface ExpenseRow {
  category: string | null;
  amount: number;
  expense_date?: string | null;
}

export interface ExpenseSummary {
  total: number;
  count: number;
  byCategory: { category: string; total: number; count: number }[];
  byDay: { day: string; total: number }[];
}

/** Aggregate expenses: grand total, per-category and per-day breakdowns. */
export function summarizeExpenses(rows: ExpenseRow[]): ExpenseSummary {
  let total = 0;
  const cat = new Map<string, { total: number; count: number }>();
  const day = new Map<string, number>();
  for (const r of rows) {
    const amt = Number(r.amount) || 0;
    total = round2(total + amt);
    const key = r.category || 'other';
    const c = cat.get(key) ?? { total: 0, count: 0 };
    cat.set(key, { total: round2(c.total + amt), count: c.count + 1 });
    if (r.expense_date) {
      const d = String(r.expense_date).slice(0, 10);
      day.set(d, round2((day.get(d) ?? 0) + amt));
    }
  }
  return {
    total,
    count: rows.length,
    byCategory: [...cat.entries()].map(([category, v]) => ({ category, ...v })).sort((a, b) => b.total - a.total),
    byDay: [...day.entries()].map(([d, t]) => ({ day: d, total: t })).sort((a, b) => (a.day < b.day ? 1 : -1)),
  };
}

/** Net cash after expenses = cash sales − cash-paid expenses (both for the period). */
export function netCashAfterExpenses(cashSales: number, cashExpenses: number): number {
  return round2((Number(cashSales) || 0) - (Number(cashExpenses) || 0));
}
