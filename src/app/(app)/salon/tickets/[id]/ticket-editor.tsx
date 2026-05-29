'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Minus, Trash2, Printer, X, CheckCircle2, ArrowRight, Loader2, SlidersHorizontal } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { addTicketItem, setItemQty, closeTicket, cancelTicket, updateTicketMeta } from '../../actions';

export interface TicketItem { id: string; name: string; price: number; qty: number }
export interface MenuService { id: string; name: string; price: number }
export interface StylistOption { id: string; full_name: string | null; email: string | null }
export interface EditorTicket { id: string; status: string; stylist_id: string | null; customer_name: string | null; customer_phone: string | null; discount_value: number }

const selectCls = 'h-9 rounded-md border border-input bg-background px-2 text-sm';

export function TicketEditor({ ticket, items, services, staff }: { ticket: EditorTicket; items: TicketItem[]; services: MenuService[]; staff: StylistOption[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [adjust, setAdjust] = useState(false);
  const [payMethod, setPayMethod] = useState('cash');
  const closed = ticket.status !== 'open';

  const subtotal = items.reduce((s, it) => s + Number(it.qty) * Number(it.price), 0);
  const discount = Math.min(ticket.discount_value, subtotal);
  const total = Math.max(subtotal - discount, 0);
  const stylistName = staff.find((s) => s.id === ticket.stylist_id);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, ok?: string) {
    startTransition(async () => { const res = await fn(); if (!res.ok) { toast.error(res.error ?? 'حدث خطأ'); return; } if (ok) toast.success(ok); router.refresh(); });
  }
  function checkout() {
    startTransition(async () => { const res = await closeTicket(ticket.id, payMethod); if (!res.ok) { toast.error(res.error ?? 'حدث خطأ'); return; } toast.success('تم التحصيل وإغلاق التذكرة'); router.push('/salon/tickets'); });
  }
  function cancel() {
    startTransition(async () => { const res = await cancelTicket(ticket.id); if (!res.ok) { toast.error(res.error ?? 'حدث خطأ'); return; } toast.success('تم الإلغاء'); router.push('/salon/tickets'); });
  }
  function saveMeta(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const fd = new FormData(e.currentTarget); fd.set('id', ticket.id);
    run(() => updateTicketMeta(fd), 'تم الحفظ'); setAdjust(false);
  }

  return (
    <div>
      <Link href="/salon/tickets" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowRight className="h-4 w-4" /> التذاكر</Link>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{ticket.customer_name || 'تذكرة عميل'}{stylistName && <span className="ms-2 text-base font-normal text-muted-foreground">— {stylistName.full_name || stylistName.email}</span>}</h1>
        {closed && <Badge variant="success">مغلقة</Badge>}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          {closed ? (
            <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">هذه التذكرة {ticket.status === 'cancelled' ? 'ملغاة' : 'مغلقة'} — للعرض فقط.</CardContent></Card>
          ) : services.length === 0 ? (
            <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">لا توجد خدمات. أضِف خدمات من صفحة الخدمات والأسعار.</CardContent></Card>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {services.map((m) => (
                <button key={m.id} disabled={pending} onClick={() => run(() => addTicketItem(ticket.id, m.id))}
                  className="flex flex-col items-center justify-center gap-1 rounded-lg border bg-card p-3 text-center text-sm transition-colors hover:border-primary/50 hover:bg-secondary disabled:opacity-50">
                  <span className="font-medium leading-tight">{m.name}</span>
                  <span className="tabular-nums text-xs text-muted-foreground" dir="ltr">{formatCurrency(m.price)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-2">
          <Card><CardContent className="space-y-3 p-4">
            {!closed && adjust && (
              <form onSubmit={saveMeta} className="space-y-2 rounded-md border bg-secondary/20 p-2 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1"><Label className="text-xs">اسم العميل</Label><Input name="customer_name" defaultValue={ticket.customer_name ?? ''} className="h-8" /></div>
                  <div className="space-y-1"><Label className="text-xs">الهاتف</Label><Input name="customer_phone" dir="ltr" defaultValue={ticket.customer_phone ?? ''} className="h-8" /></div>
                  <div className="space-y-1"><Label className="text-xs">المصفف</Label>
                    <select name="stylist_id" defaultValue={ticket.stylist_id ?? ''} className={`${selectCls} w-full`}><option value="">— غير محدد —</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.full_name || s.email}</option>)}</select>
                  </div>
                  <div className="space-y-1"><Label className="text-xs">الخصم (ج.م)</Label><Input name="discount_value" type="number" min={0} step="0.01" dir="ltr" defaultValue={ticket.discount_value} className="h-8" /></div>
                </div>
                <div className="flex gap-2"><Button type="submit" size="sm" disabled={pending}>حفظ</Button><Button type="button" size="sm" variant="ghost" onClick={() => setAdjust(false)}>إغلاق</Button></div>
              </form>
            )}

            {items.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">لا خدمات بعد — اختر من القائمة.</p>
            ) : (
              <ul className="divide-y">
                {items.map((it) => (
                  <li key={it.id} className="flex items-center justify-between gap-2 py-2">
                    <span className="min-w-0 truncate font-medium">{it.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="tabular-nums text-sm" dir="ltr">{formatCurrency(it.qty * it.price)}</span>
                      {!closed && (
                        <div className="flex items-center gap-1">
                          <Button size="icon" variant="outline" className="h-6 w-6" disabled={pending} onClick={() => run(() => setItemQty(it.id, it.qty - 1, ticket.id))}>{it.qty <= 1 ? <Trash2 className="h-3 w-3" /> : <Minus className="h-3 w-3" />}</Button>
                          <span className="w-5 text-center tabular-nums">{it.qty}</span>
                          <Button size="icon" variant="outline" className="h-6 w-6" disabled={pending} onClick={() => run(() => setItemQty(it.id, it.qty + 1, ticket.id))}><Plus className="h-3 w-3" /></Button>
                        </div>
                      )}
                      {closed && <span className="text-xs text-muted-foreground">× {it.qty}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="space-y-1 border-t pt-2 text-sm">
              <div className="flex items-center justify-between text-muted-foreground"><span>الإجمالي الفرعي</span><span className="tabular-nums" dir="ltr">{formatCurrency(subtotal)}</span></div>
              {discount > 0 && <div className="flex items-center justify-between text-muted-foreground"><span>الخصم</span><span className="tabular-nums" dir="ltr">- {formatCurrency(discount)}</span></div>}
              <div className="flex items-center justify-between border-t pt-1 text-base font-bold"><span>الإجمالي</span><span className="tabular-nums" dir="ltr">{formatCurrency(total)}</span></div>
              {!closed && <button onClick={() => setAdjust((a) => !a)} className="inline-flex items-center gap-1 pt-1 text-xs text-primary hover:underline"><SlidersHorizontal className="h-3 w-3" /> العميل / المصفف / الخصم</button>}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!closed ? (
                <>
                  <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className={`${selectCls} h-10`}><option value="cash">كاش</option><option value="card">فيزا</option></select>
                  <Button className="flex-1" disabled={pending || items.length === 0} onClick={checkout}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} تحصيل وإغلاق</Button>
                  <Link href={`/print/salon/ticket/${ticket.id}`} target="_blank" className={buttonVariants({ variant: 'outline' })}><Printer className="h-4 w-4" /></Link>
                  <Button variant="ghost" disabled={pending} onClick={cancel}><X className="h-4 w-4" /></Button>
                </>
              ) : (
                <Link href={`/print/salon/ticket/${ticket.id}`} target="_blank" className={buttonVariants({ variant: 'outline' })}><Printer className="h-4 w-4" /> طباعة الفاتورة</Link>
              )}
            </div>
          </CardContent></Card>
        </div>
      </div>
    </div>
  );
}
