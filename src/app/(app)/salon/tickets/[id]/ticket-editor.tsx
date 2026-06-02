'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SlidersHorizontal } from 'lucide-react';
import { BackLink } from '@/components/shared/back-link';
import { formatCurrency } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/provider';
import { INTL_LOCALE } from '@/lib/i18n/config';
import { ServiceTileGrid, QtyStepper, TotalRow, CheckoutFooter, selectCls } from '@/components/shared/order-editor-kit';
import { addTicketItem, setItemQty, closeTicket, cancelTicket, updateTicketMeta } from '../../actions';

export interface TicketItem { id: string; name: string; price: number; qty: number }
export interface MenuService { id: string; name: string; price: number }
export interface StylistOption { id: string; full_name: string | null; email: string | null }
export interface EditorTicket { id: string; status: string; stylist_id: string | null; customer_name: string | null; customer_phone: string | null; discount_value: number }

export function TicketEditor({ ticket, items, services, staff }: { ticket: EditorTicket; items: TicketItem[]; services: MenuService[]; staff: StylistOption[] }) {
  const { t, locale } = useI18n();
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
    startTransition(async () => { const res = await fn(); if (!res.ok) { toast.error(res.error ?? t('salon.editor.toastError')); return; } if (ok) toast.success(ok); router.refresh(); });
  }
  function checkout() {
    startTransition(async () => { const res = await closeTicket(ticket.id, payMethod); if (!res.ok) { toast.error(res.error ?? t('salon.editor.toastError')); return; } toast.success(t('salon.editor.toastCheckedOut')); router.push('/salon/tickets'); });
  }
  function cancel() {
    startTransition(async () => { const res = await cancelTicket(ticket.id); if (!res.ok) { toast.error(res.error ?? t('salon.editor.toastError')); return; } toast.success(t('salon.editor.toastCancelled')); router.push('/salon/tickets'); });
  }
  function saveMeta(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const fd = new FormData(e.currentTarget); fd.set('id', ticket.id);
    run(() => updateTicketMeta(fd), t('salon.editor.toastSaved')); setAdjust(false);
  }

  return (
    <div>
      <BackLink href="/salon/tickets" label={t('salon.editor.backLink')} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">{ticket.customer_name || t('salon.editor.defaultTitle')}{stylistName && <span className="ms-2 text-base font-normal text-muted-foreground">— {stylistName.full_name || stylistName.email}</span>}</h1>
        {closed && <Badge variant="success">{t('salon.editor.badgeClosed')}</Badge>}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          {closed ? (
            <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">{t('salon.editor.closedReadOnly', { status: ticket.status === 'cancelled' ? t('salon.editor.statusCancelled') : t('salon.editor.statusClosed') })}</CardContent></Card>
          ) : services.length === 0 ? (
            <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">{t('salon.editor.noServicesAvailable')}</CardContent></Card>
          ) : (
            <ServiceTileGrid items={services} disabled={pending} onPick={(id) => run(() => addTicketItem(ticket.id, id))} />
          )}
        </div>

        <div className="lg:col-span-2">
          <Card><CardContent className="space-y-3 p-4">
            {!closed && adjust && (
              <form onSubmit={saveMeta} className="space-y-2 rounded-md border bg-secondary/20 p-2 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1"><Label className="text-xs">{t('salon.editor.fieldCustomerName')}</Label><Input name="customer_name" defaultValue={ticket.customer_name ?? ''} className="h-8" /></div>
                  <div className="space-y-1"><Label className="text-xs">{t('salon.editor.fieldPhone')}</Label><Input name="customer_phone" dir="ltr" defaultValue={ticket.customer_phone ?? ''} className="h-8" /></div>
                  <div className="space-y-1"><Label className="text-xs">{t('salon.editor.fieldStylist')}</Label>
                    <select name="stylist_id" defaultValue={ticket.stylist_id ?? ''} className={`${selectCls} w-full`}><option value="">{t('salon.editor.unassigned')}</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.full_name || s.email}</option>)}</select>
                  </div>
                  <div className="space-y-1"><Label className="text-xs">{t('salon.editor.fieldDiscount')}</Label><Input name="discount_value" type="number" min={0} step="0.01" dir="ltr" defaultValue={ticket.discount_value} className="h-8" /></div>
                </div>
                <div className="flex gap-2"><Button type="submit" size="sm" disabled={pending}>{t('salon.editor.saveButton')}</Button><Button type="button" size="sm" variant="ghost" onClick={() => setAdjust(false)}>{t('salon.editor.closeButton')}</Button></div>
              </form>
            )}

            {items.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{t('salon.editor.emptyItems')}</p>
            ) : (
              <ul className="divide-y">
                {items.map((it) => (
                  <li key={it.id} className="flex items-center justify-between gap-2 py-2">
                    <span className="min-w-0 truncate font-medium">{it.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="tabular-nums text-sm" dir="ltr">{formatCurrency(it.qty * it.price, 'EGP', INTL_LOCALE[locale])}</span>
                      {!closed && (
                        <QtyStepper qty={it.qty} disabled={pending} onDec={() => run(() => setItemQty(it.id, it.qty - 1, ticket.id))} onInc={() => run(() => setItemQty(it.id, it.qty + 1, ticket.id))} />
                      )}
                      {closed && <span className="text-xs text-muted-foreground">× {it.qty}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="space-y-1 border-t pt-2 text-sm">
              <TotalRow label={t('salon.editor.subtotalLabel')} value={formatCurrency(subtotal, 'EGP', INTL_LOCALE[locale])} />
              {discount > 0 && <TotalRow label={t('salon.editor.discountLabel')} value={`- ${formatCurrency(discount, 'EGP', INTL_LOCALE[locale])}`} />}
              <div className="flex items-center justify-between border-t pt-1 text-base font-bold"><span>{t('salon.editor.totalLabel')}</span><span className="tabular-nums" dir="ltr">{formatCurrency(total, 'EGP', INTL_LOCALE[locale])}</span></div>
              {!closed && <button onClick={() => setAdjust((a) => !a)} className="inline-flex items-center gap-1 pt-1 text-xs text-primary hover:underline"><SlidersHorizontal className="h-3 w-3" /> {t('salon.editor.adjustLink')}</button>}
            </div>

            <CheckoutFooter
              closed={closed} pending={pending} canCheckout={items.length > 0}
              payMethod={payMethod} setPayMethod={setPayMethod} onCheckout={checkout} onCancel={cancel}
              checkoutLabel={t('salon.editor.checkoutLabel')} printHref={`/print/salon/ticket/${ticket.id}`} printLabel={t('salon.editor.printLabel')}
            />
          </CardContent></Card>
        </div>
      </div>
    </div>
  );
}
