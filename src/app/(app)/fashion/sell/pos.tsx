'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n/provider';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ProductSearchBox } from '@/components/fashion/product-search-box';
import { formatCurrency } from '@/lib/utils';
import { INTL_LOCALE } from '@/lib/i18n/config';
import type { Locale } from '@/lib/i18n/config';
import { cartTotals, variantUnitPrice, type SaleType } from '@/lib/fashion/pricing';
import { buildSchedule, financedAmount, type InstallmentFrequency } from '@/lib/fashion/installments';
import { checkout } from '../actions';
import { Trash2, Plus, Minus, Printer, FileDown } from 'lucide-react';

interface Item { product_id: string; code: string; name: string; barcode: string; cash_price: number; installment_price: number }
interface Customer { id: string; name: string; phone: string | null }
interface Line extends Item { quantity: number }

export function Pos({ items, customers, locale }: { items: Item[]; customers: Customer[]; locale: Locale }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [cart, setCart] = useState<Line[]>([]);
  const [saleType, setSaleType] = useState<SaleType>('cash');
  const [customerId, setCustomerId] = useState('');
  const [discount, setDiscount] = useState(0);
  const [down, setDown] = useState(0);
  const [count, setCount] = useState(3);
  const [freq, setFreq] = useState<InstallmentFrequency>('monthly');
  const [lastSale, setLastSale] = useState<{ id: string; number: string } | null>(null);
  const [focusSignal, setFocusSignal] = useState(0);
  const money = (n: number) => formatCurrency(n, 'EGP', INTL_LOCALE[locale]);
  const newSale = () => { setLastSale(null); setFocusSignal((n) => n + 1); };

  function addItem(it: Item) {
    setCart((c) => {
      const i = c.findIndex((l) => l.product_id === it.product_id);
      if (i >= 0) { const n = [...c]; n[i] = { ...n[i], quantity: n[i].quantity + 1 }; return n; }
      return [...c, { ...it, quantity: 1 }];
    });
  }
  const setQty = (id: string, d: number) => setCart((c) => c.flatMap((l) => l.product_id === id ? (l.quantity + d <= 0 ? [] : [{ ...l, quantity: l.quantity + d }]) : [l]));
  const removeLine = (id: string) => setCart((c) => c.filter((l) => l.product_id !== id));

  const lines = cart.map((l) => ({ product_id: l.product_id, quantity: l.quantity, unit_price: variantUnitPrice(l, saleType) }));
  const totals = cartTotals(lines, discount);
  const financed = financedAmount(totals.net, down);
  const preview = saleType === 'installment' ? buildSchedule(financed, count, freq, new Date().toISOString().slice(0, 10)) : [];

  function submit() {
    if (cart.length === 0) { toast.error(t('fashion.errors.emptyCart')); return; }
    if (saleType === 'installment' && !customerId) { toast.error(t('fashion.errors.customerRequired')); return; }
    start(async () => {
      const res = await checkout({
        customerId: customerId || null, lines, discount, saleType,
        downPayment: down, installmentCount: count, frequency: freq,
        startDate: new Date().toISOString().slice(0, 10),
      });
      if (res.ok && res.data) {
        toast.success(`${t('fashion.sell.done')} · ${res.data.invoiceNumber}`);
        setLastSale({ id: res.data.invoiceId, number: res.data.invoiceNumber });
        setCart([]); setDiscount(0); setDown(0); setCustomerId('');
        setFocusSignal((n) => n + 1); // return the cursor to the scan field
        router.refresh();
      } else toast.error(res.error || 'Error');
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="space-y-3">
        {lastSale && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-success/40 bg-success/10 p-2 text-sm">
            <span className="min-w-0 truncate">
              {t('fashion.sell.done')} · <span className="font-mono" dir="ltr">{lastSale.number}</span>
            </span>
            <span className="flex shrink-0 flex-wrap items-center gap-1">
              <Link
                href={`/print/fashion/invoice/${lastSale.id}`}
                target="_blank"
                className="inline-flex items-center gap-1 rounded-md bg-success/20 px-2 py-1 text-xs font-medium hover:bg-success/30"
              >
                <Printer className="h-3.5 w-3.5" /> {t('fashion.invoices.print')}
              </Link>
              <Link
                href={`/print/fashion/invoice/${lastSale.id}?print=1`}
                target="_blank"
                className="inline-flex items-center gap-1 rounded-md bg-success/20 px-2 py-1 text-xs font-medium hover:bg-success/30"
              >
                <FileDown className="h-3.5 w-3.5" /> {t('fashion.invoices.savePdf')}
              </Link>
              <button
                type="button"
                onClick={newSale}
                className="inline-flex items-center gap-1 rounded-md bg-success/20 px-2 py-1 text-xs font-medium hover:bg-success/30"
              >
                <Plus className="h-3.5 w-3.5" /> {t('fashion.sell.newSale')}
              </button>
            </span>
          </div>
        )}
        <div>
          <ProductSearchBox
            items={items}
            autoFocus
            focusSignal={focusSignal}
            placeholder={t('fashion.sell.searchPlaceholder')}
            onSelect={addItem}
            onNoMatch={() => toast.error(t('fashion.errors.notFound'))}
            renderMeta={(it) => <span className="font-mono text-sm tabular-nums">{money(it.cash_price)}</span>}
          />
          <p className="mt-1 px-1 text-xs text-muted-foreground">{t('fashion.sell.searchHint')}</p>
        </div>
        <Card><CardContent className="p-3">
          {cart.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">{t('fashion.sell.emptyCart')}</p> : (
            <div className="space-y-2">{cart.map((l) => {
              const unit = variantUnitPrice(l, saleType);
              return (
                <div key={l.product_id} className="flex items-center gap-2 border-b pb-2">
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{l.name}</p><p className="font-mono text-xs text-muted-foreground">{l.code} · {money(unit)}</p></div>
                  <div className="flex items-center gap-1">
                    <Button type="button" size="icon" variant="outline" className="h-7 w-7" onClick={() => setQty(l.product_id, -1)}><Minus className="h-3 w-3" /></Button>
                    <span className="w-8 text-center text-sm tabular-nums">{l.quantity}</span>
                    <Button type="button" size="icon" variant="outline" className="h-7 w-7" onClick={() => setQty(l.product_id, 1)}><Plus className="h-3 w-3" /></Button>
                  </div>
                  <span className="w-20 text-end text-sm font-semibold tabular-nums">{money(unit * l.quantity)}</span>
                  <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeLine(l.product_id)}><Trash2 className="h-3 w-3" /></Button>
                </div>
              );
            })}</div>
          )}
        </CardContent></Card>
      </div>

      <Card className="h-fit"><CardContent className="space-y-3 p-4">
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant={saleType === 'cash' ? 'default' : 'outline'} onClick={() => setSaleType('cash')}>{t('fashion.sell.cash')}</Button>
          <Button type="button" variant={saleType === 'installment' ? 'default' : 'outline'} onClick={() => setSaleType('installment')}>{t('fashion.sell.installment')}</Button>
        </div>
        <label className="block text-xs">{t('fashion.sell.customer')}
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm">
            <option value="">{t('fashion.sell.walkIn')}</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>)}
          </select>
        </label>
        <label className="block text-xs">{t('fashion.sell.discount')}
          <Input type="number" step="0.01" min={0} value={discount} onChange={(e) => setDiscount(Number(e.target.value) || 0)} className="mt-1" />
        </label>

        {saleType === 'installment' && (
          <div className="space-y-2 rounded-md border p-2">
            <label className="block text-xs">{t('fashion.sell.downPayment')}<Input type="number" step="0.01" min={0} value={down} onChange={(e) => setDown(Number(e.target.value) || 0)} className="mt-1" /></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs">{t('fashion.sell.installmentCount')}<Input type="number" min={1} value={count} onChange={(e) => setCount(Math.max(1, Number(e.target.value) || 1))} className="mt-1" /></label>
              <label className="block text-xs">{t('fashion.sell.frequency')}
                <select value={freq} onChange={(e) => setFreq(e.target.value as InstallmentFrequency)} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm">
                  <option value="weekly">{t('fashion.sell.weekly')}</option><option value="biweekly">{t('fashion.sell.biweekly')}</option><option value="monthly">{t('fashion.sell.monthly')}</option>
                </select>
              </label>
            </div>
            {preview.length > 0 && (
              <div className="max-h-32 overflow-y-auto text-xs">
                {preview.map((r) => <div key={r.seqNo} className="flex justify-between border-t py-0.5"><span>{r.dueDate}</span><span className="tabular-nums">{money(r.amount)}</span></div>)}
              </div>
            )}
          </div>
        )}

        <div className="space-y-1 border-t pt-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">{t('fashion.sell.subtotal')}</span><span className="tabular-nums">{money(totals.total)}</span></div>
          {totals.discount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">{t('fashion.sell.discount')}</span><span className="tabular-nums">-{money(totals.discount)}</span></div>}
          <div className="flex justify-between text-base font-bold"><span>{t('fashion.sell.net')}</span><span className="tabular-nums text-success">{money(totals.net)}</span></div>
        </div>
        <Button type="button" className="h-12 w-full text-base" disabled={pending} onClick={submit}>{t('fashion.sell.charge')}</Button>
      </CardContent></Card>
    </div>
  );
}
