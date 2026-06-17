'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Search, ArrowRight, CheckCircle2, MapPinOff } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { INTL_LOCALE } from '@/lib/i18n/config';
import { formatCurrency } from '@/lib/utils';
import { creditStatusOf, isOverdueBlocked, type CreditStatus } from '@/lib/van-sales/sell';

export interface PickerCustomer {
  id: string; name: string; name_ar: string | null; code: string;
  balance: number; credit_limit: number;
  payment_terms_days: number | null; credit_control_enabled: boolean | null;
  oldest_unpaid_date: string | null;
  /** In today's journey plan (Today JP). */
  in_journey: boolean;
  /** This rep already invoiced the customer today. */
  sold_today: boolean;
}

const VARIANT: Record<CreditStatus, 'success' | 'warning' | 'destructive' | 'secondary'> = {
  good: 'success', near_limit: 'warning', over_limit: 'destructive', overdue: 'destructive', cash_only: 'secondary',
};

type Tab = 'today' | 'all';

/** F1/F2: pick a customer ONCE → the statement (visit context). Split into
 *  Today JP (planned route, default) and All Customers (emergency/unplanned).
 *  Sold-today customers are marked green; selecting a sold-today or off-route
 *  customer raises a non-blocking warning (Continue / Cancel) — UX only, no
 *  change to any sale/stock/accounting record. */
export function CustomerPicker({ customers }: { customers: PickerCustomer[] }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const intl = INTL_LOCALE[locale];
  const ar = locale === 'ar';
  const today = new Date().toISOString().slice(0, 10);
  const [tab, setTab] = useState<Tab>('today');
  const [q, setQ] = useState('');
  const [pending, setPending] = useState<{ c: PickerCustomer; soldToday: boolean; unplanned: boolean } | null>(null);
  const [reason, setReason] = useState('');
  const cName = (c: PickerCustomer) => (ar && c.name_ar ? c.name_ar : c.name);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const scope = tab === 'today' ? customers.filter((c) => c.in_journey) : customers;
    const base = s ? scope.filter((c) => cName(c).toLowerCase().includes(s) || c.code.toLowerCase().includes(s)) : scope;
    return base.slice(0, 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, customers, ar, tab]);

  function statusOf(c: PickerCustomer): CreditStatus {
    const overdue = isOverdueBlocked(c.payment_terms_days, c.oldest_unpaid_date, today, c.credit_control_enabled !== false);
    return creditStatusOf({ creditLimit: Number(c.credit_limit), currentBalance: Number(c.balance), overdue });
  }

  function go(c: PickerCustomer, offRoute: boolean, why: string) {
    // Carry off-route awareness to the visit context (UX flag only). The reason is
    // captured client-side; it never touches the invoice/stock/accounting records.
    if (offRoute) {
      try { sessionStorage.setItem(`vanSales.offRoute.${c.id}`, why.trim()); } catch { /* ignore */ }
    }
    router.push(`/field/van-sales/statement/${c.id}${offRoute ? '?offroute=1' : ''}`);
  }

  function select(c: PickerCustomer) {
    const unplanned = !c.in_journey;
    if (c.sold_today || unplanned) { setReason(''); setPending({ c, soldToday: c.sold_today, unplanned }); return; }
    go(c, false, '');
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        {/* Today JP (default) vs All Customers */}
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-sm font-medium">
          <button type="button" onClick={() => setTab('today')}
            className={`rounded-md py-1.5 transition-colors ${tab === 'today' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>
            {t('vanSales.picker.tabToday')}
          </button>
          <button type="button" onClick={() => setTab('all')}
            className={`rounded-md py-1.5 transition-colors ${tab === 'all' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>
            {t('vanSales.picker.tabAll')}
          </button>
        </div>

        <div className="relative">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="ps-9" placeholder={t('vanSales.sell.searchCustomer')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        <ul className="divide-y">
          {list.map((c) => {
            const st = statusOf(c);
            return (
              <li key={c.id}>
                <button type="button" onClick={() => select(c)} className="flex w-full items-center justify-between gap-2 py-3 text-start hover:bg-secondary/40">
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      {c.sold_today && <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />}
                      <span className="truncate font-medium">{cName(c)}</span>
                    </span>
                    <span className="block text-xs text-muted-foreground" dir="ltr">{c.code} · {formatCurrency(c.balance, 'EGP', intl)}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {c.sold_today && <Badge variant="success">{t('vanSales.picker.soldToday')}</Badge>}
                    {tab === 'all' && !c.in_journey && (
                      <Badge variant="warning" className="gap-1"><MapPinOff className="h-3 w-3" />{t('vanSales.picker.offRoute')}</Badge>
                    )}
                    <Badge variant={VARIANT[st]}>{t(`vanSales.sell.payment.cs_${st}`)}</Badge>
                    <ArrowRight className="h-4 w-4 text-muted-foreground rtl:rotate-180" />
                  </span>
                </button>
              </li>
            );
          })}
          {list.length === 0 && (
            <li className="py-6 text-center text-sm text-muted-foreground">
              {tab === 'today' ? t('vanSales.picker.emptyToday') : t('vanSales.sell.noCustomers')}
            </li>
          )}
        </ul>
      </CardContent>

      {/* Non-blocking warning (sold-today and/or off-route) — Continue / Cancel. */}
      {pending && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={() => setPending(null)}>
          <div className="w-full max-w-md space-y-3 rounded-t-2xl border bg-card p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:rounded-2xl sm:pb-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold">
              {pending.soldToday ? t('vanSales.picker.soldWarnTitle') : t('vanSales.picker.offRouteTitle')}
            </h3>
            <p className="font-medium">{cName(pending.c)}</p>
            {pending.soldToday && <p className="text-sm text-muted-foreground">{t('vanSales.picker.soldWarn')}</p>}
            {pending.unplanned && (
              <>
                <p className="text-sm text-muted-foreground">{t('vanSales.picker.offRouteWarn')}</p>
                <div className="space-y-1.5">
                  <Label>{t('vanSales.picker.reasonLabel')}</Label>
                  <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('vanSales.picker.reasonPlaceholder')} />
                </div>
              </>
            )}
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setPending(null)}>{t('vanSales.picker.cancel')}</Button>
              <Button className="flex-1" onClick={() => { const p = pending; setPending(null); go(p.c, p.unplanned, reason); }}>
                {t('vanSales.picker.continue')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
