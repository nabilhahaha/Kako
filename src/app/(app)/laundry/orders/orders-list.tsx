'use client';

import { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Loader2, WashingMachine, Bike } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { createOrder } from '../actions';
import { useI18n } from '@/lib/i18n/provider';
import { INTL_LOCALE } from '@/lib/i18n/config';

export interface LaundryOrder { id: string; customer_name: string | null; customer_phone: string | null; status: string; due_date: string | null; is_delivery: boolean; total: number; item_count: number }

export function OrdersList({ orders }: { orders: LaundryOrder[] }) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState('all');
  const [pending, startTransition] = useTransition();

  const STATUS: Record<string, { label: string; variant: 'info' | 'warning' | 'success' | 'secondary' | 'destructive' }> = {
    received: { label: t('laundry.status.received'), variant: 'info' },
    washing: { label: t('laundry.status.washing'), variant: 'warning' },
    ready: { label: t('laundry.status.ready'), variant: 'success' },
    delivered: { label: t('laundry.status.delivered'), variant: 'secondary' },
    cancelled: { label: t('laundry.status.cancelled'), variant: 'destructive' },
  };

  const FILTERS: { key: string; label: string }[] = [
    { key: 'all', label: t('laundry.filter.all') },
    { key: 'received', label: t('laundry.filter.received') },
    { key: 'washing', label: t('laundry.filter.washing') },
    { key: 'ready', label: t('laundry.filter.ready') },
  ];

  const shown = useMemo(() => filter === 'all' ? orders : orders.filter((o) => o.status === filter), [orders, filter]);

  function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createOrder({
        customer_name: String(fd.get('customer_name') || ''),
        customer_phone: String(fd.get('customer_phone') || ''),
        is_delivery: fd.get('is_delivery') === 'on',
      });
      if (!res.ok || !res.data) { toast.error(res.error ?? t('laundry.orders.failedToOpen')); return; }
      router.push(`/laundry/orders/${res.data}`);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {!adding ? (
          <Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> {t('laundry.orders.newButton')}</Button>
        ) : <span />}
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)} className={`rounded-full border px-3 py-1 text-sm ${filter === f.key ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-secondary'}`}>{f.label}</button>
          ))}
        </div>
      </div>

      {adding && (
        <Card><CardContent className="pt-6">
          <form onSubmit={onCreate} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1"><Label>{t('laundry.orders.labelCustomerName')}</Label><Input name="customer_name" placeholder={t('laundry.orders.placeholderCustomerName')} /></div>
              <div className="space-y-1"><Label>{t('laundry.orders.labelPhone')}</Label><Input name="customer_phone" dir="ltr" /></div>
              <div className="flex items-end"><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_delivery" className="h-4 w-4" /> {t('laundry.orders.labelDelivery')}</label></div>
            </div>
            <div className="flex gap-2"><Button type="submit" disabled={pending}>{pending && <Loader2 className="h-4 w-4 animate-spin" />} {t('laundry.orders.openOrderButton')}</Button><Button type="button" variant="outline" onClick={() => setAdding(false)}>{t('laundry.orders.cancelButton')}</Button></div>
          </form>
        </CardContent></Card>
      )}

      {shown.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">{t('laundry.orders.empty')}</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((o) => {
            const st = STATUS[o.status] ?? { label: o.status, variant: 'secondary' as const };
            return (
              <Card key={o.id} className="cursor-pointer transition-colors hover:border-primary/40" onClick={() => router.push(`/laundry/orders/${o.id}`)}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 font-medium">
                      {o.is_delivery ? <Bike className="h-4 w-4 text-muted-foreground" /> : <WashingMachine className="h-4 w-4 text-muted-foreground" />}
                      {o.customer_name || t('laundry.orders.fallbackCustomer')}
                    </span>
                    <Badge variant={st.variant}>{st.label}</Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{t('laundry.orders.itemCount').replace('{count}', String(o.item_count))}{o.due_date ? ` · ${t('laundry.orders.dueDate').replace('{date}', formatDate(o.due_date, INTL_LOCALE[locale]))}` : ''}</span>
                    <span className="tabular-nums font-semibold text-foreground" dir="ltr">{formatCurrency(o.total, 'EGP', INTL_LOCALE[locale])}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
