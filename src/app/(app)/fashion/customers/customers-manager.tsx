'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n/provider';
import { Card, CardContent } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/utils';
import { INTL_LOCALE } from '@/lib/i18n/config';
import type { Locale } from '@/lib/i18n/config';
import { createCustomer } from '../actions';
import { Plus, CreditCard } from 'lucide-react';

interface Customer { id: string; name: string; phone: string | null; balance: number }

export function CustomersManager({ customers, locale }: { customers: Customer[]; locale: Locale }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const money = (n: number) => formatCurrency(n, 'EGP', INTL_LOCALE[locale]);

  return (
    <div className="space-y-4">
      <Card><CardContent className="p-4">
        <form onSubmit={(e) => { e.preventDefault(); const form = e.currentTarget; start(async () => { const res = await createCustomer(new FormData(form)); if (res.ok) { toast.success(t('fashion.customers.saved')); form.reset(); router.refresh(); } else toast.error(res.error || 'Error'); }); }} className="flex flex-wrap items-end gap-2">
          <Input name="name" placeholder={t('fashion.customers.name')} required className="min-w-40 flex-1" />
          <Input name="phone" placeholder={t('fashion.customers.phone')} className="min-w-40 flex-1" />
          <Button type="submit" disabled={pending}><Plus className="h-4 w-4" />{t('fashion.customers.new')}</Button>
        </form>
      </CardContent></Card>

      {customers.length === 0 ? (
        <p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">{t('fashion.customers.empty')}</p>
      ) : (
        <Card><CardContent className="p-0">
          <table className="w-full text-sm">
            <tbody>{customers.map((c) => (
              <tr key={c.id} className="border-b last:border-0">
                <td className="p-3"><p className="font-medium">{c.name}</p>{c.phone && <p className="text-xs text-muted-foreground" dir="ltr">{c.phone}</p>}</td>
                <td className="p-3 text-end"><span className={`tabular-nums ${Number(c.balance) > 0 ? 'text-warning' : ''}`}>{money(Number(c.balance || 0))}</span></td>
                <td className="p-3 text-end"><Link href="/fashion/installments" className={buttonVariants({ size: 'sm', variant: 'outline' })}><CreditCard className="h-4 w-4" />{t('fashion.customers.statement')}</Link></td>
              </tr>
            ))}</tbody>
          </table>
        </CardContent></Card>
      )}
    </div>
  );
}
