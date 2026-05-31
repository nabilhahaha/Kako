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
import { useI18n } from '@/lib/i18n/provider';
import { INTL_LOCALE } from '@/lib/i18n/config';

export interface OrderItem { id: string; name: string; qty: number; price: number }
export interface MenuService { id: string; name: string; price: number }
export interface EditorOrder {
  id: string; status: string; customer_name: string | null; customer_phone: string | null; customer_address: string | null;
  is_delivery: boolean; delivery_fee: number; discount_value: number; due_date: string | null; notes: string | null;
}

export function OrderEditor({ order, items, services }: { order: EditorOrder; items: OrderItem[]; services: MenuService[] }) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const [pending, startTransition] = useTransition();
  const [adjust, setAdjust] = useState(false);
  const [payMethod, setPayMethod] = useState('cash');
  const closed = order.status === 'delivered' || order.status === 'cancelled';

  const STATUS: Record<string, { label: string; variant: 'info' | 'warning' | 'success' | 'secondary' | 'destructive' }> = {
    received: { label: t('laundry.status.received'), variant: 'info' },
    washing: { label: t('laundry.status.washing'), variant: 'warning' },
    ready: { label: t('laundry.status.ready'), variant: 'success' },
    delivered: { label: t('laundry.status.delivered'), variant: 'secondary' },
    cancelled: { label: t('laundry.status.cancelled'), variant: 'destructive' },
  };

  const subtotal = items.reduce((s, it) => s + Number(it.qty) * Number(it.price), 0);
  const discount = Math.min(order.discount_value, subtotal);
  const total = Math.max(subtotal - discount + Number(order.delivery_fee || 0), 0);
  const st = STATUS[order.status] ?? { label: order.status, variant: 'secondary' as const };

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, ok?: string) {
    startTransition(async () => { const res = await fn(); if (!res.ok) { toast.error(res.error ?? t('laundry.editor.toastError')); return; } if (ok) toast.success(ok); router.refresh(); });
  }
  function checkout() {
    startTransition(async () => { const res = await closeOrder(order.id, payMethod); if (!res.ok) { toast.error(res.error ?? t('laundry.editor.toastError')); return; } toast.success(t('laundry.editor.toastDelivered')); router.push('/laundry/orders'); });
  }
  function cancel() {
    startTransition(async () => { const res = await cancelOrder(order.id); if (!res.ok) { toast.error(res.error ?? t('laundry.editor.toastError')); return; } toast.success(t('laundry.editor.toastCancelled')); router.push('/laundry/orders'); });
  }
  function saveMeta(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const fd = new FormData(e.currentTarget); fd.set('id', order.id);
    run(() => updateOrderMeta(fd), t('laundry.editor.toastSaved')); setAdjust(false);
  }

  return (
    <div>
      <Link href="/laundry/orders" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowRight className="h-4 w-4" /> {t('laundry.editor.backLink')}</Link>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{order.customer_name || t('laundry.editor.fallbackTitle')}</h1>
        <Badge variant={st.variant}>{st.label}</Badge>
      </div>

      {/* Workflow */}
      {!closed && (
        <div className="mb-4 flex flex-wrap gap-2">
          {order.status === 'received' && <Button variant="outline" disabled={pending} onClick={() => run(() => setOrderStatus(order.id, 'washing'), t('laundry.editor.toastWashingStarted'))}><Flame className="h-4 w-4" /> {t('laundry.editor.startWashing')}</Button>}
          {order.status === 'washing' && <Button variant="outline" disabled={pending} onClick={() => run(() => setOrderStatus(order.id, 'ready'), t('laundry.editor.toastReady'))}><PackageCheck className="h-4 w-4" /> {t('laundry.editor.markReady')}</Button>}
          {order.status === 'ready' && <span className="text-sm text-success">{t('laundry.editor.orderReadyHint')}</span>}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          {closed ? (
            <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">{t('laundry.editor.closedOrder').replace('{state}', order.status === 'cancelled' ? t('laundry.editor.closedStateCancelled') : t('laundry.editor.closedStateDelivered'))}</CardContent></Card>
          ) : services.length === 0 ? (
            <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">{t('laundry.editor.noServices')}</CardContent></Card>
          ) : (
            <ServiceTileGrid items={services} disabled={pending} onPick={(id) => run(() => addOrderItem(order.id, id))} />
          )}
        </div>

        <div className="lg:col-span-2">
          <Card><CardContent className="space-y-3 p-4">
            {!closed && adjust && (
              <form onSubmit={saveMeta} className="space-y-2 rounded-md border bg-secondary/20 p-2 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1"><Label className="text-xs">{t('laundry.editor.labelCustomerName')}</Label><Input name="customer_name" defaultValue={order.customer_name ?? ''} className="h-8" /></div>
                  <div className="space-y-1"><Label className="text-xs">{t('laundry.editor.labelPhone')}</Label><Input name="customer_phone" dir="ltr" defaultValue={order.customer_phone ?? ''} className="h-8" /></div>
                  <div className="col-span-2 space-y-1"><Label className="text-xs">{t('laundry.editor.labelAddress')}</Label><Input name="customer_address" defaultValue={order.customer_address ?? ''} className="h-8" /></div>
                  <div className="space-y-1"><Label className="text-xs">{t('laundry.editor.labelDueDate')}</Label><Input name="due_date" type="date" dir="ltr" defaultValue={order.due_date ?? ''} className="h-8" /></div>
                  <div className="flex items-end"><label className="flex items-center gap-2 text-xs"><input type="checkbox" name="is_delivery" defaultChecked={order.is_delivery} className="h-4 w-4" /> {t('laundry.editor.labelDelivery')}</label></div>
                  <div className="space-y-1"><Label className="text-xs">{t('laundry.editor.labelDeliveryFee')}</Label><Input name="delivery_fee" type="number" min={0} step="0.01" dir="ltr" defaultValue={order.delivery_fee} className="h-8" /></div>
                  <div className="space-y-1"><Label className="text-xs">{t('laundry.editor.labelDiscount')}</Label><Input name="discount_value" type="number" min={0} step="0.01" dir="ltr" defaultValue={order.discount_value} className="h-8" /></div>
                </div>
                <input type="hidden" name="notes" value={order.notes ?? ''} />
                <div className="flex gap-2"><Button type="submit" size="sm" disabled={pending}>{t('laundry.editor.saveButton')}</Button><Button type="button" size="sm" variant="ghost" onClick={() => setAdjust(false)}>{t('laundry.editor.closeButton')}</Button></div>
              </form>
            )}

            {items.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{t('laundry.editor.noItemsYet')}</p>
            ) : (
              <ul className="divide-y">
                {items.map((it) => (
                  <li key={it.id} className="flex items-center justify-between gap-2 py-2">
                    <span className="min-w-0 truncate font-medium">{it.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="tabular-nums text-sm" dir="ltr">{formatCurrency(it.qty * it.price, 'EGP', INTL_LOCALE[locale])}</span>
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
              <TotalRow label={t('laundry.editor.subtotal')} value={formatCurrency(subtotal, 'EGP', INTL_LOCALE[locale])} />
              {discount > 0 && <TotalRow label={t('laundry.editor.discount')} value={`- ${formatCurrency(discount, 'EGP', INTL_LOCALE[locale])}`} />}
              {order.delivery_fee > 0 && <TotalRow label={t('laundry.editor.deliveryFee')} value={formatCurrency(order.delivery_fee, 'EGP', INTL_LOCALE[locale])} />}
              <div className="flex items-center justify-between border-t pt-1 text-base font-bold"><span>{t('laundry.editor.total')}</span><span className="tabular-nums" dir="ltr">{formatCurrency(total, 'EGP', INTL_LOCALE[locale])}</span></div>
              {!closed && <button onClick={() => setAdjust((a) => !a)} className="inline-flex items-center gap-1 pt-1 text-xs text-primary hover:underline"><SlidersHorizontal className="h-3 w-3" /> {t('laundry.editor.adjustLink')}</button>}
            </div>

            <CheckoutFooter
              closed={closed} pending={pending} canCheckout={items.length > 0}
              payMethod={payMethod} setPayMethod={setPayMethod} onCheckout={checkout} onCancel={cancel}
              checkoutLabel={t('laundry.editor.checkoutLabel')} printHref={`/print/laundry/order/${order.id}`} printLabel={t('laundry.editor.printLabel')}
            />
          </CardContent></Card>
        </div>
      </div>
    </div>
  );
}
