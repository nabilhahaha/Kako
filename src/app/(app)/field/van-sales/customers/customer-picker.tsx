'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, ArrowRight } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { INTL_LOCALE } from '@/lib/i18n/config';
import { formatCurrency } from '@/lib/utils';
import { creditStatusOf, isOverdueBlocked, type CreditStatus } from '@/lib/van-sales/sell';

export interface PickerCustomer {
  id: string; name: string; name_ar: string | null; code: string;
  balance: number; credit_limit: number;
  payment_terms_days: number | null; credit_control_enabled: boolean | null;
  oldest_unpaid_date: string | null;
}

const VARIANT: Record<CreditStatus, 'success' | 'warning' | 'destructive' | 'secondary'> = {
  good: 'success', near_limit: 'warning', over_limit: 'destructive', overdue: 'destructive', cash_only: 'secondary',
};

/** F1/F2: pick a customer ONCE → the statement (visit context) for that customer,
 *  from which Collect / Sell / Return / Print all branch. Read-only list. */
export function CustomerPicker({ customers }: { customers: PickerCustomer[] }) {
  const { t, locale } = useI18n();
  const intl = INTL_LOCALE[locale];
  const ar = locale === 'ar';
  const today = new Date().toISOString().slice(0, 10);
  const [q, setQ] = useState('');
  const cName = (c: PickerCustomer) => (ar && c.name_ar ? c.name_ar : c.name);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const base = s ? customers.filter((c) => cName(c).toLowerCase().includes(s) || c.code.toLowerCase().includes(s)) : customers;
    return base.slice(0, 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, customers, ar]);

  function statusOf(c: PickerCustomer): CreditStatus {
    const overdue = isOverdueBlocked(c.payment_terms_days, c.oldest_unpaid_date, today, c.credit_control_enabled !== false);
    return creditStatusOf({ creditLimit: Number(c.credit_limit), currentBalance: Number(c.balance), overdue });
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="relative">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="ps-9" placeholder={t('vanSales.sell.searchCustomer')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <ul className="divide-y">
          {list.map((c) => {
            const st = statusOf(c);
            return (
              <li key={c.id}>
                <Link href={`/field/van-sales/statement/${c.id}`} className="flex items-center justify-between gap-2 py-3 hover:bg-secondary/40">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{cName(c)}</span>
                    <span className="block text-xs text-muted-foreground" dir="ltr">{c.code} · {formatCurrency(c.balance, 'EGP', intl)}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <Badge variant={VARIANT[st]}>{t(`vanSales.sell.payment.cs_${st}`)}</Badge>
                    <ArrowRight className="h-4 w-4 text-muted-foreground rtl:rotate-180" />
                  </span>
                </Link>
              </li>
            );
          })}
          {list.length === 0 && <li className="py-6 text-center text-sm text-muted-foreground">{t('vanSales.sell.noCustomers')}</li>}
        </ul>
      </CardContent>
    </Card>
  );
}
