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
import { ArrowRight, StickyNote, SlidersHorizontal } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/provider';
import { usePrompt } from '@/components/prompt-dialog';
import { ServiceTileGrid, QtyStepper, TotalRow, CheckoutFooter } from '@/components/shared/order-editor-kit';
import { addOrderItem, setItemQty, setItemNotes, closeOrder, cancelOrder, updateOrderMeta } from '../../actions';

export interface OrderItem { id: string; product_id: string | null; name: string; qty: number; price: number; notes: string | null; kitchen_status: string }
export interface MenuItem { id: string; name: string; price: number }
export interface MenuCategory { id: string; name: string; items: MenuItem[] }
export interface EditorOrder {
  id: string; order_type: string; status: string;
  customer_name: string | null; customer_phone: string | null; customer_address: string | null;
  delivery_fee: number; discount_type: 'amount' | 'percent'; discount_value: number; service_rate: number; tax_rate: number;
  notes: string | null; table_name: string | null;
}

const selectCls = 'h-8 rounded-md border border-input bg-background px-2 text-sm';

export function OrderEditor({ order, items, menu }: { order: EditorOrder; items: OrderItem[]; menu: MenuCategory[] }) {
  const router = useRouter();
  const { t } = useI18n();
  const prompt = usePrompt();
  const [pending, startTransition] = useTransition();
  const [activeCat, setActiveCat] = useState(menu[0]?.id ?? '');
  const [adjust, setAdjust] = useState(false);
  const [payMethod, setPayMethod] = useState('cash');
  const closed = order.status !== 'open';

  const subtotal = items.reduce((s, it) => s + Number(it.qty) * Number(it.price), 0);
  const discount = order.discount_type === 'percent' ? Math.round(subtotal * order.discount_value) / 100 : Math.min(order.discount_value, subtotal);
  const base = Math.max(subtotal - discount + Number(order.delivery_fee || 0), 0);
  const service = Math.round(base * order.service_rate) / 100;
  const tax = Math.round((base + service) * order.tax_rate) / 100;
  const total = base + service + tax;
  const cat = menu.find((c) => c.id === activeCat) ?? menu[0];

  const KITCHEN: Record<string, { label: string; variant: 'secondary' | 'warning' | 'success' }> = {
    new: { label: t('restaurant.kitchenStatus.new'), variant: 'secondary' },
    preparing: { label: t('restaurant.kitchenStatus.preparing'), variant: 'warning' },
    ready: { label: t('restaurant.kitchenStatus.ready'), variant: 'success' },
  };

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, ok?: string) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) { toast.error(res.error ?? t('restaurant.editor.errorGeneric')); return; }
      if (ok) toast.success(ok);
      router.refresh();
    });
  }

  function checkout() {
    startTransition(async () => {
      const res = await closeOrder(order.id, payMethod);
      if (!res.ok) { toast.error(res.error ?? t('restaurant.editor.errorGeneric')); return; }
      toast.success(t('restaurant.editor.toastCheckedOut'));
      router.push('/restaurant/orders');
    });
  }

  function cancel() {
    startTransition(async () => {
      const res = await cancelOrder(order.id);
      if (!res.ok) { toast.error(res.error ?? t('restaurant.editor.errorGeneric')); return; }
      toast.success(t('restaurant.editor.toastCancelled'));
      router.push('/restaurant/orders');
    });
  }

  function saveMeta(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set('id', order.id);
    run(() => updateOrderMeta(fd), t('restaurant.editor.toastMetaSaved'));
    setAdjust(false);
  }

  function editNote(it: OrderItem) {
    prompt({ title: t('restaurant.editor.noteTitle', { name: it.name }), label: t('restaurant.editor.noteLabel'), defaultValue: it.notes ?? '', confirmText: t('restaurant.editor.noteConfirm') })
      .then((raw) => { if (raw == null) return; run(() => setItemNotes(it.id, raw, order.id), t('restaurant.editor.toastNoteSaved')); });
  }

  const title = order.table_name
    ? t('restaurant.editor.tableLabel', { name: order.table_name })
    : (order.customer_name || t(`restaurant.orderType.${order.order_type}`));

  return (
    <div>
      <Link href="/restaurant/orders" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowRight className="h-4 w-4" /> {t('restaurant.editor.backToOrders')}
      </Link>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold">{title} <Badge variant="secondary">{t(`restaurant.orderType.${order.order_type}`) ?? order.order_type}</Badge></h1>
        {closed && <Badge variant="success">{t('restaurant.editor.statusClosed')}</Badge>}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Menu */}
        <div className="lg:col-span-3">
          {closed ? (
            <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">
              {t('restaurant.editor.closedNotice', { status: order.status === 'cancelled' ? t('restaurant.editor.statusCancelled') : t('restaurant.editor.statusClosed') })}
            </CardContent></Card>
          ) : menu.length === 0 ? (
            <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">{t('restaurant.editor.emptyMenu')}</CardContent></Card>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap gap-1">
                {menu.map((c) => (
                  <button key={c.id} onClick={() => setActiveCat(c.id)}
                    className={`rounded-full border px-3 py-1 text-sm ${c.id === (cat?.id) ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-secondary'}`}>
                    {c.name}
                  </button>
                ))}
              </div>
              <ServiceTileGrid items={cat?.items ?? []} disabled={pending} onPick={(id) => run(() => addOrderItem(order.id, id))} />
            </>
          )}
        </div>

        {/* Ticket */}
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="space-y-3 p-4">
              {!closed && adjust && (
                <form onSubmit={saveMeta} className="space-y-2 rounded-md border bg-secondary/20 p-2 text-sm">
                  {order.order_type === 'delivery' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1"><Label className="text-xs">{t('restaurant.editor.fieldCustomerName')}</Label><Input name="customer_name" defaultValue={order.customer_name ?? ''} className="h-8" /></div>
                      <div className="space-y-1"><Label className="text-xs">{t('restaurant.editor.fieldPhone')}</Label><Input name="customer_phone" dir="ltr" defaultValue={order.customer_phone ?? ''} className="h-8" /></div>
                      <div className="col-span-2 space-y-1"><Label className="text-xs">{t('restaurant.editor.fieldAddress')}</Label><Input name="customer_address" defaultValue={order.customer_address ?? ''} className="h-8" /></div>
                      <div className="space-y-1"><Label className="text-xs">{t('restaurant.editor.fieldDeliveryFee')}</Label><Input name="delivery_fee" type="number" min={0} step="0.01" dir="ltr" defaultValue={order.delivery_fee} className="h-8" /></div>
                    </div>
                  )}
                  {order.order_type !== 'delivery' && <input type="hidden" name="delivery_fee" value={order.delivery_fee} />}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">{t('restaurant.editor.fieldDiscount')}</Label>
                      <div className="flex gap-1">
                        <Input name="discount_value" type="number" min={0} step="0.01" dir="ltr" defaultValue={order.discount_value} className="h-8" />
                        <select name="discount_type" defaultValue={order.discount_type} className={selectCls}><option value="amount">{t('restaurant.editor.discountAmount')}</option><option value="percent">%</option></select>
                      </div>
                    </div>
                    <div className="space-y-1"><Label className="text-xs">{t('restaurant.editor.fieldService')}</Label><Input name="service_rate" type="number" min={0} step="0.01" dir="ltr" defaultValue={order.service_rate} className="h-8" /></div>
                    <div className="space-y-1"><Label className="text-xs">{t('restaurant.editor.fieldTax')}</Label><Input name="tax_rate" type="number" min={0} step="0.01" dir="ltr" defaultValue={order.tax_rate} className="h-8" /></div>
                  </div>
                  <div className="flex gap-2"><Button type="submit" size="sm" disabled={pending}>{t('restaurant.editor.save')}</Button><Button type="button" size="sm" variant="ghost" onClick={() => setAdjust(false)}>{t('restaurant.editor.close')}</Button></div>
                </form>
              )}

              {items.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">{t('restaurant.editor.emptyItems')}</p>
              ) : (
                <ul className="divide-y">
                  {items.map((it) => {
                    const ks = KITCHEN[it.kitchen_status] ?? KITCHEN.new;
                    return (
                      <li key={it.id} className="py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate font-medium">{it.name}</span>
                          <span className="shrink-0 tabular-nums text-sm" dir="ltr">{formatCurrency(it.qty * it.price)}</span>
                        </div>
                        {it.notes && <p className="text-xs text-muted-foreground">📝 {it.notes}</p>}
                        <div className="mt-1 flex items-center justify-between">
                          <Badge variant={ks.variant} className="text-[10px]">{ks.label}</Badge>
                          {!closed && (
                            <div className="flex items-center gap-1">
                              <Button size="icon" variant="ghost" className="h-6 w-6" disabled={pending} onClick={() => editNote(it)}><StickyNote className="h-3 w-3" /></Button>
                              <QtyStepper qty={it.qty} disabled={pending} onDec={() => run(() => setItemQty(it.id, it.qty - 1, order.id))} onInc={() => run(() => setItemQty(it.id, it.qty + 1, order.id))} />
                            </div>
                          )}
                          {closed && <span className="text-xs text-muted-foreground">× {it.qty}</span>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="space-y-1 border-t pt-2 text-sm">
                <TotalRow label={t('restaurant.editor.subtotal')} value={formatCurrency(subtotal)} />
                {discount > 0 && <TotalRow label={t('restaurant.editor.discount')} value={`- ${formatCurrency(discount)}`} />}
                {order.delivery_fee > 0 && <TotalRow label={t('restaurant.editor.deliveryFee')} value={formatCurrency(order.delivery_fee)} />}
                {service > 0 && <TotalRow label={t('restaurant.editor.serviceLine', { rate: order.service_rate })} value={formatCurrency(service)} />}
                {tax > 0 && <TotalRow label={t('restaurant.editor.taxLine', { rate: order.tax_rate })} value={formatCurrency(tax)} />}
                <div className="flex items-center justify-between border-t pt-1 text-base font-bold">
                  <span>{t('restaurant.editor.total')}</span><span className="tabular-nums" dir="ltr">{formatCurrency(total)}</span>
                </div>
                {!closed && (
                  <button onClick={() => setAdjust((a) => !a)} className="inline-flex items-center gap-1 pt-1 text-xs text-primary hover:underline">
                    <SlidersHorizontal className="h-3 w-3" /> {order.order_type === 'delivery' ? t('restaurant.editor.adjustBtnWithCustomer') : t('restaurant.editor.adjustBtn')}
                  </button>
                )}
              </div>

              <CheckoutFooter
                closed={closed} pending={pending} canCheckout={items.length > 0}
                payMethod={payMethod} setPayMethod={setPayMethod} onCheckout={checkout} onCancel={cancel}
                checkoutLabel={t('restaurant.editor.checkoutLabel')} printHref={`/print/restaurant/order/${order.id}`} printLabel={t('restaurant.editor.printLabel')}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
