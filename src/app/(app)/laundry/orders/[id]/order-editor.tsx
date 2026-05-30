'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, SlidersHorizontal, Flame, PackageCheck } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { ServiceTileGrid, QtyStepper, TotalRow, CheckoutFooter } from '@/components/shared/order-editor-kit';
import { addOrderItem, setItemQty, setOrderStatus, closeOrder, cancelOrder, updateOrderMeta } from '../../actions';
import { STATUS } from '../orders-list';

export interface OrderItem { id: string; name: string; qty: number; price: number }
export interface MenuService { id: string; name: string; price: number }
export interface EditorOrder {
  id: string; status: string; customer_name: string | null; customer_phone: string | null; customer_address: string | null;
  is_delivery: boolean; delivery_fee: number; discount_value: number; due_date: string | null; notes: string | null;
}

export function OrderEditor({ order, items, services }: { order: EditorOrder; items: OrderItem[]; services: MenuService[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [adjust, setAdjust] = useState(false);
  const [payMethod, setPayMethod] = useState('cash');
  const closed = order.status === 'delivered' || order.status === 'cancelled';

  const subtotal = items.reduce((s, it) => s + Number(it.qty) * Number(it.price), 0);
  const discount = Math.min(order.discount_value, subtotal);
  const total = Math.max(subtotal - discount + Number(order.delivery_fee || 0), 0);
  const st = STATUS[order.status] ?? { label: order.status, variant: 'secondary' as const };

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, ok?: string) {
    startTransition(async () => { const res = await fn(); if (!res.ok) { toast.error(res.error ?? 'حدث خطأ'); return; } if (ok) toast.success(ok); router.refresh(); });
  }
  function checkout() {
    startTransition(async () => { const res = await closeOrder(order.id, payMethod); if (!res.ok) { toast.error(res.error ?? 'حدث خطأ'); return; } toast.success('تم التسليم والتحصيل'); router.push('/laundry/orders'); });
  }
  function cancel() {
    startTransition(async () => { const res = await cancelOrder(order.id); if (!res.ok) { toast.error(res.error ?? 'حدث خطأ'); return; } toast.success('تم الإلغاء'); router.push('/laundry/orders'); });
  }
  function saveMeta(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const fd = new FormData(e.currentTarget); fd.set('id', order.id);
    run(() => updateOrderMeta(fd), 'تم الحفظ'); setAdjust(false);
  }

  return (
    <div>
      <Link href="/laundry/orders" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowRight className="h-4 w-4" /> الطلبات</Link>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{order.customer_name || 'طلب مغسلة'}</h1>
        <Badge variant={st.variant}>{st.label}</Badge>
      </div>

      {/* Workflow */}
      {!closed && (
        <div className="mb-4 flex flex-wrap gap-2">
          {order.status === 'received' && <Button variant="outline" disabled={pending} onClick={() => run(() => setOrderStatus(order.id, 'washing'), 'بدأ الغسيل')}><Flame className="h-4 w-4" /> بدء الغسيل</Button>}
          {order.status === 'washing' && <Button variant="outline" disabled={pending} onClick={() => run(() => setOrderStatus(order.id, 'ready'), 'الطلب جاهز')}><PackageCheck className="h-4 w-4" /> جاهز للتسليم</Button>}
          {order.status === 'ready' && <span className="text-sm text-success">الطلب جاهز — سلّم وحصّل بالأسفل.</span>}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          {closed ? (
            <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">هذا الطلب {order.status === 'cancelled' ? 'ملغي' : 'تم تسليمه'} — للعرض فقط.</CardContent></Card>
          ) : services.length === 0 ? (
            <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">لا توجد أصناف. أضِف من صفحة الأصناف والأسعار.</CardContent></Card>
          ) : (
            <ServiceTileGrid items={services} disabled={pending} onPick={(id) => run(() => addOrderItem(order.id, id))} />
          )}
        </div>

        <div className="lg:col-span-2">
          <Card><CardContent className="space-y-3 p-4">
            {!closed && adjust && (
              <form onSubmit={saveMeta} className="space-y-2 rounded-md border bg-secondary/20 p-2 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1"><Label className="text-xs">اسم العميل</Label><Input name="customer_name" defaultValue={order.customer_name ?? ''} className="h-8" /></div>
                  <div className="space-y-1"><Label className="text-xs">الهاتف</Label><Input name="customer_phone" dir="ltr" defaultValue={order.customer_phone ?? ''} className="h-8" /></div>
                  <div className="col-span-2 space-y-1"><Label className="text-xs">العنوان</Label><Input name="customer_address" defaultValue={order.customer_address ?? ''} className="h-8" /></div>
                  <div className="space-y-1"><Label className="text-xs">موعد التسليم</Label><Input name="due_date" type="date" dir="ltr" defaultValue={order.due_date ?? ''} className="h-8" /></div>
                  <div className="flex items-end"><label className="flex items-center gap-2 text-xs"><input type="checkbox" name="is_delivery" defaultChecked={order.is_delivery} className="h-4 w-4" /> توصيل</label></div>
                  <div className="space-y-1"><Label className="text-xs">رسوم التوصيل</Label><Input name="delivery_fee" type="number" min={0} step="0.01" dir="ltr" defaultValue={order.delivery_fee} className="h-8" /></div>
                  <div className="space-y-1"><Label className="text-xs">الخصم</Label><Input name="discount_value" type="number" min={0} step="0.01" dir="ltr" defaultValue={order.discount_value} className="h-8" /></div>
                </div>
                <input type="hidden" name="notes" value={order.notes ?? ''} />
                <div className="flex gap-2"><Button type="submit" size="sm" disabled={pending}>حفظ</Button><Button type="button" size="sm" variant="ghost" onClick={() => setAdjust(false)}>إغلاق</Button></div>
              </form>
            )}

            {items.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">لا قطع بعد — اختر من القائمة.</p>
            ) : (
              <ul className="divide-y">
                {items.map((it) => (
                  <li key={it.id} className="flex items-center justify-between gap-2 py-2">
                    <span className="min-w-0 truncate font-medium">{it.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="tabular-nums text-sm" dir="ltr">{formatCurrency(it.qty * it.price)}</span>
                      {!closed && (
                        <QtyStepper qty={it.qty} disabled={pending} onDec={() => run(() => setItemQty(it.id, it.qty - 1, order.id))} onInc={() => run(() => setItemQty(it.id, it.qty + 1, order.id))} />
                      )}
                      {closed && <span className="text-xs text-muted-foreground">× {it.qty}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="space-y-1 border-t pt-2 text-sm">
              <TotalRow label="الإجمالي الفرعي" value={formatCurrency(subtotal)} />
              {discount > 0 && <TotalRow label="الخصم" value={`- ${formatCurrency(discount)}`} />}
              {order.delivery_fee > 0 && <TotalRow label="رسوم التوصيل" value={formatCurrency(order.delivery_fee)} />}
              <div className="flex items-center justify-between border-t pt-1 text-base font-bold"><span>الإجمالي</span><span className="tabular-nums" dir="ltr">{formatCurrency(total)}</span></div>
              {!closed && <button onClick={() => setAdjust((a) => !a)} className="inline-flex items-center gap-1 pt-1 text-xs text-primary hover:underline"><SlidersHorizontal className="h-3 w-3" /> العميل / التوصيل / الخصم / الموعد</button>}
            </div>

            <CheckoutFooter
              closed={closed} pending={pending} canCheckout={items.length > 0}
              payMethod={payMethod} setPayMethod={setPayMethod} onCheckout={checkout} onCancel={cancel}
              checkoutLabel="تسليم وتحصيل" printHref={`/print/laundry/order/${order.id}`} printLabel="طباعة الإيصال"
            />
          </CardContent></Card>
        </div>
      </div>
    </div>
  );
}
