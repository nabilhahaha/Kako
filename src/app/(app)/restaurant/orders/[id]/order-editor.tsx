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

const TYPE: Record<string, string> = { dine_in: 'صالة', takeaway: 'تيك أواي', delivery: 'دليفري' };
const KITCHEN: Record<string, { label: string; variant: 'secondary' | 'warning' | 'success' }> = {
  new: { label: 'جديد', variant: 'secondary' }, preparing: { label: 'تحضير', variant: 'warning' }, ready: { label: 'جاهز', variant: 'success' },
};
const selectCls = 'h-8 rounded-md border border-input bg-background px-2 text-sm';

export function OrderEditor({ order, items, menu }: { order: EditorOrder; items: OrderItem[]; menu: MenuCategory[] }) {
  const router = useRouter();
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

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, ok?: string) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) { toast.error(res.error ?? 'حدث خطأ'); return; }
      if (ok) toast.success(ok);
      router.refresh();
    });
  }

  function checkout() {
    startTransition(async () => {
      const res = await closeOrder(order.id, payMethod);
      if (!res.ok) { toast.error(res.error ?? 'حدث خطأ'); return; }
      toast.success('تم تحصيل الأوردر وإغلاقه');
      router.push('/restaurant/orders');
    });
  }

  function cancel() {
    startTransition(async () => {
      const res = await cancelOrder(order.id);
      if (!res.ok) { toast.error(res.error ?? 'حدث خطأ'); return; }
      toast.success('تم إلغاء الأوردر');
      router.push('/restaurant/orders');
    });
  }

  function saveMeta(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set('id', order.id);
    run(() => updateOrderMeta(fd), 'تم حفظ الحساب');
    setAdjust(false);
  }

  function editNote(it: OrderItem) {
    prompt({ title: `ملاحظة: ${it.name}`, label: 'مثال: بدون بصل / زيادة جبنة', defaultValue: it.notes ?? '', confirmText: 'حفظ' })
      .then((raw) => { if (raw == null) return; run(() => setItemNotes(it.id, raw, order.id), 'تم حفظ الملاحظة'); });
  }

  const title = order.table_name ? `طاولة ${order.table_name}` : (order.customer_name || TYPE[order.order_type]);

  return (
    <div>
      <Link href="/restaurant/orders" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowRight className="h-4 w-4" /> الأوردرات
      </Link>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold">{title} <Badge variant="secondary">{TYPE[order.order_type] ?? order.order_type}</Badge></h1>
        {closed && <Badge variant="success">مغلق</Badge>}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Menu */}
        <div className="lg:col-span-3">
          {closed ? (
            <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">هذا الأوردر {order.status === 'cancelled' ? 'ملغي' : 'مغلق'} — للعرض فقط.</CardContent></Card>
          ) : menu.length === 0 ? (
            <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">لا توجد أصناف في المنيو. أضِف منتجات من صفحة المنتجات.</CardContent></Card>
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
                      <div className="space-y-1"><Label className="text-xs">اسم العميل</Label><Input name="customer_name" defaultValue={order.customer_name ?? ''} className="h-8" /></div>
                      <div className="space-y-1"><Label className="text-xs">الهاتف</Label><Input name="customer_phone" dir="ltr" defaultValue={order.customer_phone ?? ''} className="h-8" /></div>
                      <div className="col-span-2 space-y-1"><Label className="text-xs">العنوان</Label><Input name="customer_address" defaultValue={order.customer_address ?? ''} className="h-8" /></div>
                      <div className="space-y-1"><Label className="text-xs">رسوم التوصيل</Label><Input name="delivery_fee" type="number" min={0} step="0.01" dir="ltr" defaultValue={order.delivery_fee} className="h-8" /></div>
                    </div>
                  )}
                  {order.order_type !== 'delivery' && <input type="hidden" name="delivery_fee" value={order.delivery_fee} />}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">الخصم</Label>
                      <div className="flex gap-1">
                        <Input name="discount_value" type="number" min={0} step="0.01" dir="ltr" defaultValue={order.discount_value} className="h-8" />
                        <select name="discount_type" defaultValue={order.discount_type} className={selectCls}><option value="amount">ج.م</option><option value="percent">%</option></select>
                      </div>
                    </div>
                    <div className="space-y-1"><Label className="text-xs">خدمة %</Label><Input name="service_rate" type="number" min={0} step="0.01" dir="ltr" defaultValue={order.service_rate} className="h-8" /></div>
                    <div className="space-y-1"><Label className="text-xs">ضريبة %</Label><Input name="tax_rate" type="number" min={0} step="0.01" dir="ltr" defaultValue={order.tax_rate} className="h-8" /></div>
                  </div>
                  <div className="flex gap-2"><Button type="submit" size="sm" disabled={pending}>حفظ</Button><Button type="button" size="sm" variant="ghost" onClick={() => setAdjust(false)}>إغلاق</Button></div>
                </form>
              )}

              {items.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">لا أصناف بعد — اختر من المنيو.</p>
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
                <TotalRow label="الإجمالي الفرعي" value={formatCurrency(subtotal)} />
                {discount > 0 && <TotalRow label="الخصم" value={`- ${formatCurrency(discount)}`} />}
                {order.delivery_fee > 0 && <TotalRow label="رسوم التوصيل" value={formatCurrency(order.delivery_fee)} />}
                {service > 0 && <TotalRow label={`خدمة ${order.service_rate}%`} value={formatCurrency(service)} />}
                {tax > 0 && <TotalRow label={`ضريبة ${order.tax_rate}%`} value={formatCurrency(tax)} />}
                <div className="flex items-center justify-between border-t pt-1 text-base font-bold">
                  <span>الإجمالي</span><span className="tabular-nums" dir="ltr">{formatCurrency(total)}</span>
                </div>
                {!closed && (
                  <button onClick={() => setAdjust((a) => !a)} className="inline-flex items-center gap-1 pt-1 text-xs text-primary hover:underline">
                    <SlidersHorizontal className="h-3 w-3" /> خصم / خدمة / ضريبة{order.order_type === 'delivery' ? ' / عميل' : ''}
                  </button>
                )}
              </div>

              <CheckoutFooter
                closed={closed} pending={pending} canCheckout={items.length > 0}
                payMethod={payMethod} setPayMethod={setPayMethod} onCheckout={checkout} onCancel={cancel}
                checkoutLabel="تحصيل وإغلاق" printHref={`/print/restaurant/order/${order.id}`} printLabel="طباعة الفاتورة"
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
