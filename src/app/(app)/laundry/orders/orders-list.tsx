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

export interface LaundryOrder { id: string; customer_name: string | null; customer_phone: string | null; status: string; due_date: string | null; is_delivery: boolean; total: number; item_count: number }

export const STATUS: Record<string, { label: string; variant: 'info' | 'warning' | 'success' | 'secondary' | 'destructive' }> = {
  received: { label: 'استلام', variant: 'info' }, washing: { label: 'غسيل', variant: 'warning' }, ready: { label: 'جاهز', variant: 'success' },
  delivered: { label: 'تم التسليم', variant: 'secondary' }, cancelled: { label: 'ملغي', variant: 'destructive' },
};
const FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: 'الكل' }, { key: 'received', label: 'استلام' }, { key: 'washing', label: 'غسيل' }, { key: 'ready', label: 'جاهز' },
];

export function OrdersList({ orders }: { orders: LaundryOrder[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState('all');
  const [pending, startTransition] = useTransition();

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
      if (!res.ok || !res.data) { toast.error(res.error ?? 'تعذّر فتح الطلب'); return; }
      router.push(`/laundry/orders/${res.data}`);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {!adding ? (
          <Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> طلب جديد</Button>
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
              <div className="space-y-1"><Label>اسم العميل</Label><Input name="customer_name" placeholder="اسم العميل" /></div>
              <div className="space-y-1"><Label>الهاتف</Label><Input name="customer_phone" dir="ltr" /></div>
              <div className="flex items-end"><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_delivery" className="h-4 w-4" /> توصيل للمنزل</label></div>
            </div>
            <div className="flex gap-2"><Button type="submit" disabled={pending}>{pending && <Loader2 className="h-4 w-4 animate-spin" />} فتح الطلب</Button><Button type="button" variant="outline" onClick={() => setAdding(false)}>إلغاء</Button></div>
          </form>
        </CardContent></Card>
      )}

      {shown.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">لا توجد طلبات.</CardContent></Card>
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
                      {o.customer_name || 'عميل'}
                    </span>
                    <Badge variant={st.variant}>{st.label}</Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{o.item_count} قطعة{o.due_date ? ` · تسليم ${formatDate(o.due_date)}` : ''}</span>
                    <span className="tabular-nums font-semibold text-foreground" dir="ltr">{formatCurrency(o.total)}</span>
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
