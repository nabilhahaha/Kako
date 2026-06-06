'use client';

import { useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n/provider';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatCard } from '@/components/shared/stat-card';
import { formatCurrency, formatDate } from '@/lib/utils';
import { INTL_LOCALE } from '@/lib/i18n/config';
import type { Locale } from '@/lib/i18n/config';
import { EXPENSE_CATEGORIES, expenseCategoryLabel, type ExpenseSummary } from '@/lib/fashion/expenses';
import { addExpense } from '../actions';
import { Wallet, Receipt, TrendingDown } from 'lucide-react';

export interface FashionExpense {
  id: string;
  expense_date: string;
  category: string | null;
  description: string | null;
  amount: number;
  payment_method: string | null;
  paid_from: string | null;
  paid_by: string | null;
  note: string | null;
}

const METHODS = ['cash', 'card', 'bank_transfer'] as const;

export function ExpensesManager({
  expenses, summary, cashSales, netCash, from, to, category, canCreate, locale,
}: {
  expenses: FashionExpense[];
  summary: ExpenseSummary;
  cashSales: number;
  netCash: number;
  from: string;
  to: string;
  category: string;
  canCreate: boolean;
  locale: Locale;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, start] = useTransition();
  const intl = INTL_LOCALE[locale];
  const money = (n: number) => formatCurrency(Number(n) || 0, 'EGP', intl);
  const catLabel = (v: string | null) => expenseCategoryLabel(v, locale === 'ar' ? 'ar' : 'en');
  const methodLabel = (m: string | null) => (m ? t(`fashion.expenses.method_${m}` as 'fashion.expenses.method_cash') : '—');

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value); else params.delete(key);
    router.replace(`/fashion/expenses?${params.toString()}`);
  };

  const onCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    start(async () => {
      const res = await addExpense(new FormData(form));
      if (res.ok) { toast.success(t('fashion.expenses.saved')); form.reset(); router.refresh(); }
      else toast.error(res.error || 'Error');
    });
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs">{t('fashion.expenses.from')}
          <Input type="date" dir="ltr" defaultValue={from} onChange={(e) => setParam('from', e.target.value)} className="mt-1 h-9 w-40" />
        </label>
        <label className="text-xs">{t('fashion.expenses.to')}
          <Input type="date" dir="ltr" defaultValue={to} onChange={(e) => setParam('to', e.target.value)} className="mt-1 h-9 w-40" />
        </label>
        <label className="text-xs">{t('fashion.expenses.category')}
          <select defaultValue={category} onChange={(e) => setParam('category', e.target.value)} className="mt-1 h-9 rounded-md border bg-background px-2 text-sm">
            <option value="">{t('fashion.expenses.allCategories')}</option>
            {EXPENSE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{locale === 'ar' ? c.ar : c.en}</option>)}
          </select>
        </label>
      </div>

      {/* Summary */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label={t('fashion.expenses.totalExpenses')} value={money(summary.total)} icon={Receipt} tone="warning" hint={t('fashion.expenses.countHint', { count: summary.count })} />
        <StatCard label={t('fashion.expenses.cashSales')} value={money(cashSales)} icon={Wallet} tone="info" />
        <StatCard label={t('fashion.expenses.netCash')} value={money(netCash)} icon={TrendingDown} tone={netCash < 0 ? 'destructive' : 'success'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Create */}
        {canCreate && (
          <Card className="lg:col-span-1 h-fit"><CardContent className="p-4">
            <h2 className="mb-2 text-sm font-semibold">{t('fashion.expenses.addExpense')}</h2>
            <form onSubmit={onCreate} className="space-y-2">
              <Input name="expense_date" type="date" dir="ltr" defaultValue={to} required />
              <select name="category" required defaultValue="" className="h-10 w-full rounded-md border bg-background px-2 text-sm">
                <option value="" disabled>{t('fashion.expenses.category')}</option>
                {EXPENSE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{locale === 'ar' ? c.ar : c.en}</option>)}
              </select>
              <Input name="description" placeholder={t('fashion.expenses.descriptionField')} />
              <Input name="amount" type="number" step="0.01" min="0" placeholder={t('fashion.expenses.amount')} required />
              <select name="payment_method" defaultValue="cash" className="h-10 w-full rounded-md border bg-background px-2 text-sm">
                {METHODS.map((m) => <option key={m} value={m}>{t(`fashion.expenses.method_${m}` as 'fashion.expenses.method_cash')}</option>)}
              </select>
              <Input name="paid_by" placeholder={t('fashion.expenses.paidBy')} />
              <Input name="attachment_url" placeholder={t('fashion.expenses.attachment')} />
              <Input name="note" placeholder={t('fashion.expenses.note')} />
              <Button type="submit" className="w-full" disabled={pending}>{t('fashion.common.add')}</Button>
            </form>
          </CardContent></Card>
        )}

        <div className={`space-y-4 ${canCreate ? 'lg:col-span-2' : 'lg:col-span-3'}`}>
          {/* By category */}
          {summary.byCategory.length > 0 && (
            <Card><CardContent className="p-0">
              <h2 className="border-b p-3 text-sm font-semibold">{t('fashion.expenses.byCategory')}</h2>
              <div className="divide-y">
                {summary.byCategory.map((c) => (
                  <div key={c.category} className="flex items-center justify-between p-2.5 text-sm">
                    <span>{catLabel(c.category)} <span className="text-xs text-muted-foreground">({c.count})</span></span>
                    <span className="tabular-nums" dir="ltr">{money(c.total)}</span>
                  </div>
                ))}
              </div>
            </CardContent></Card>
          )}

          {/* List */}
          <Card><CardContent className="p-0">
            <h2 className="border-b p-3 text-sm font-semibold">{t('fashion.expenses.list')}</h2>
            {expenses.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">{t('fashion.expenses.empty')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-secondary/50 text-muted-foreground">
                    <tr>
                      <th className="p-2 text-start font-medium">{t('fashion.expenses.date')}</th>
                      <th className="p-2 text-start font-medium">{t('fashion.expenses.category')}</th>
                      <th className="p-2 text-start font-medium">{t('fashion.expenses.descriptionField')}</th>
                      <th className="p-2 text-start font-medium">{t('fashion.expenses.method')}</th>
                      <th className="p-2 text-start font-medium">{t('fashion.expenses.paidBy')}</th>
                      <th className="p-2 text-end font-medium">{t('fashion.expenses.amount')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.map((e) => (
                      <tr key={e.id} className="border-b last:border-0">
                        <td className="p-2 text-muted-foreground">{formatDate(e.expense_date, intl)}</td>
                        <td className="p-2">{catLabel(e.category)}</td>
                        <td className="p-2">{e.description || e.note || '—'}</td>
                        <td className="p-2 text-xs">{methodLabel(e.payment_method ?? e.paid_from)}</td>
                        <td className="p-2 text-xs">{e.paid_by || '—'}</td>
                        <td className="p-2 text-end tabular-nums" dir="ltr">{money(e.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent></Card>
        </div>
      </div>
    </div>
  );
}
