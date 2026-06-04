'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n/provider';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/utils';
import { INTL_LOCALE } from '@/lib/i18n/config';
import type { Locale } from '@/lib/i18n/config';
import { cashVariance } from '@/lib/fashion/cashbox';
import { openCashbox, closeCashbox, addExpense } from '../actions';

interface Summary { openingFloat: number; inflows: number; outflows: number; expected: number }

export function CashboxPanel({ session, summary, locale }: {
  session: { id: string; opening_float: number; opened_at: string } | null;
  summary: Summary | null; locale: Locale;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [counted, setCounted] = useState(0);
  const money = (n: number) => formatCurrency(n, 'EGP', INTL_LOCALE[locale]);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => start(async () => {
    const res = await fn();
    if (res.ok) { toast.success(ok); router.refresh(); } else toast.error(res.error || 'Error');
  });

  if (!session || !summary) {
    return (
      <Card className="max-w-md"><CardContent className="p-4">
        <p className="mb-3 text-sm text-muted-foreground">{t('fashion.cashbox.noOpen')}</p>
        <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); run(() => openCashbox(fd), t('fashion.cashbox.opened')); }} className="flex items-end gap-2">
          <label className="flex-1 text-xs">{t('fashion.cashbox.openingFloat')}<Input name="opening_float" type="number" step="0.01" defaultValue="0" className="mt-1" /></label>
          <Button type="submit" disabled={pending}>{t('fashion.cashbox.open')}</Button>
        </form>
      </CardContent></Card>
    );
  }

  const variance = cashVariance(counted, summary.expected);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardContent className="space-y-2 p-4">
        <Row label={t('fashion.cashbox.openingFloat')} value={money(summary.openingFloat)} />
        <Row label={t('fashion.cashbox.sales') + ' + ' + t('fashion.cashbox.collections')} value={money(summary.inflows)} />
        <Row label={t('fashion.cashbox.expenses')} value={'-' + money(summary.outflows)} />
        <div className="border-t pt-2"><Row label={t('fashion.cashbox.expected')} value={money(summary.expected)} bold /></div>
        <form onSubmit={(e) => { e.preventDefault(); run(() => closeCashbox(session.id, counted), t('fashion.cashbox.closed')); }} className="space-y-2 border-t pt-3">
          <label className="block text-xs">{t('fashion.cashbox.counted')}<Input type="number" step="0.01" value={counted} onChange={(e) => setCounted(Number(e.target.value) || 0)} className="mt-1" /></label>
          <Row label={t('fashion.cashbox.variance')} value={money(variance)} />
          <Button type="submit" variant="outline" className="w-full" disabled={pending}>{t('fashion.cashbox.close')}</Button>
        </form>
      </CardContent></Card>

      <Card className="h-fit"><CardContent className="p-4">
        <h2 className="mb-2 text-sm font-semibold">{t('fashion.cashbox.addExpense')}</h2>
        <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); run(() => addExpense(fd), t('fashion.common.save')); (e.target as HTMLFormElement).reset(); }} className="space-y-2">
          <Input name="category" placeholder={t('fashion.cashbox.expenseCategory')} required />
          <Input name="amount" type="number" step="0.01" placeholder={t('fashion.cashbox.amount')} required />
          <Button type="submit" className="w-full" disabled={pending}>{t('fashion.common.add')}</Button>
        </form>
      </CardContent></Card>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return <div className={`flex justify-between text-sm ${bold ? 'font-bold' : ''}`}><span className="text-muted-foreground">{label}</span><span className="tabular-nums">{value}</span></div>;
}
