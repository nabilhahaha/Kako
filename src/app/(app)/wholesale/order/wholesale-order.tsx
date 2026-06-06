'use client';

import { useState, useMemo, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Search, Trash2, Loader2, FileText } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { openPrintView } from '@/lib/erp/print';
import { recordMutation } from '@/lib/sync/web/write-seam';
import type { PaymentMethod } from '@/lib/erp/types';
import { wholesaleInvoice } from '../actions';
import { useI18n } from '@/lib/i18n/provider';

export interface BranchOpt { id: string; name: string; name_ar: string | null }
export interface WCustomer { id: string; name: string; tier_id: string | null }
export interface WProduct { id: string; name: string; sell_price: number }

interface Line { product: WProduct; qty: number; price: number }

const selectCls = 'h-10 rounded-md border border-input bg-background px-2 text-sm';

export function WholesaleOrder({ branches, customers, products, tierPrices }: { branches: BranchOpt[]; customers: WCustomer[]; products: WProduct[]; tierPrices: Record<string, number> }) {
  const { t } = useI18n();
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [customerId, setCustomerId] = useState('');
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<Line[]>([]);
  const [collect, setCollect] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>('cash' as PaymentMethod);
  const [pending, startTransition] = useTransition();

  const customer = customers.find((c) => c.id === customerId) ?? null;
  const tierId = customer?.tier_id ?? null;

  function priceFor(p: WProduct): number {
    if (tierId) { const tp = tierPrices[`${tierId}|${p.id}`]; if (tp != null) return tp; }
    return p.sell_price;
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return products.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 18);
  }, [products, query]);

  function add(p: WProduct) {
    setCart((prev) => {
      const ex = prev.find((l) => l.product.id === p.id);
      if (ex) return prev.map((l) => l.product.id === p.id ? { ...l, qty: l.qty + 1 } : l);
      return [...prev, { product: p, qty: 1, price: priceFor(p) }];
    });
  }
  function onCustomerChange(id: string) {
    setCustomerId(id);
    // Re-fill line prices from the newly selected customer's tier ("set once").
    const c = customers.find((x) => x.id === id) ?? null;
    const t = c?.tier_id ?? null;
    setCart((prev) => prev.map((l) => ({ ...l, price: (t && tierPrices[`${t}|${l.product.id}`] != null) ? tierPrices[`${t}|${l.product.id}`] : l.product.sell_price })));
  }

  const total = cart.reduce((s, l) => s + l.qty * l.price, 0);

  function submit() {
    if (!customerId) { toast.error(t('wholesale.toastChooseCustomer')); return; }
    if (!branchId) { toast.error(t('wholesale.toastChooseBranch')); return; }
    if (cart.length === 0) return;
    startTransition(async () => {
      const res = await wholesaleInvoice({
        branch_id: branchId, customer_id: customerId, collect, payment_method: method,
        lines: cart.map((l) => ({ product_id: l.product.id, quantity: l.qty, unit_price: l.price, discount_pct: 0, tax_rate: 0 })),
      });
      if (!res.ok || !res.data) { toast.error(res.error ?? t('wholesale.toastIssueFailed')); return; }
      // Local-first journal (orders = append-only). No-op unless KAKO_SYNC is on.
      void recordMutation({
        entity: 'orders', op: 'insert', pk: res.data.invoice_id,
        payload: {
          invoice_id: res.data.invoice_id, invoice_number: res.data.invoice_number,
          branch_id: branchId, customer_id: customerId, payment_method: method, collect,
          lines: cart.map((l) => ({ product_id: l.product.id, quantity: l.qty, unit_price: l.price })),
        },
      });
      toast.success(t('wholesale.toastInvoiceIssued', { number: res.data.invoice_number }));
      setCart([]); setCustomerId('');
      openPrintView(`/print/receipt/${res.data.invoice_id}`);
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="lg:col-span-3 space-y-3">
        <div className="flex flex-wrap gap-2">
          {branches.length > 1 && (
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={selectCls}>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name_ar || b.name}</option>)}
            </select>
          )}
          <select value={customerId} onChange={(e) => onCustomerChange(e.target.value)} className={`${selectCls} min-w-48 flex-1`}>
            <option value="">{t('wholesale.optChooseCustomer')}</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {customer && <p className="text-xs text-muted-foreground">{t('wholesale.priceLevelLabel')} <span className="font-medium text-foreground">{tierId ? t('wholesale.priceLevelCustom') : t('wholesale.priceLevelRetail')}</span> — {t('wholesale.priceLevelHint')}</p>}

        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('wholesale.placeholderSearchItem')} className="ps-9" />
        </div>
        {filtered.length > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {filtered.map((p) => (
              <button key={p.id} onClick={() => { add(p); setQuery(''); }} className="flex flex-col items-center gap-1 rounded-lg border bg-card p-2 text-center text-sm hover:border-primary/50 hover:bg-secondary">
                <span className="font-medium leading-tight">{p.name}</span>
                <span className="text-xs text-muted-foreground tabular-nums" dir="ltr">{formatCurrency(priceFor(p))}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="lg:col-span-2">
        <Card><CardContent className="space-y-3 p-4">
          <h2 className="flex items-center gap-2 font-semibold"><FileText className="h-4 w-4" /> {t('wholesale.invoiceLinesTitle')}</h2>
          {cart.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t('wholesale.emptyCart')}</p>
          ) : (
            <ul className="divide-y">
              {cart.map((l) => (
                <li key={l.product.id} className="space-y-1 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate font-medium">{l.product.name}</span>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setCart((p) => p.filter((x) => x.product.id !== l.product.id))}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                  <div className="flex items-center gap-2" dir="ltr">
                    <Input type="number" min={0} step="any" value={l.qty} onChange={(e) => setCart((p) => p.map((x) => x.product.id === l.product.id ? { ...x, qty: Number(e.target.value) } : x))} className="h-8 w-16 text-center" />
                    <span className="text-xs text-muted-foreground">×</span>
                    <Input type="number" min={0} step="0.01" value={l.price} onChange={(e) => setCart((p) => p.map((x) => x.product.id === l.product.id ? { ...x, price: Number(e.target.value) } : x))} className="h-8 w-24 text-center" />
                    <span className="ms-auto text-sm tabular-nums">{formatCurrency(l.qty * l.price)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center justify-between border-t pt-2 text-lg font-bold"><span>{t('wholesale.labelTotal')}</span><span className="tabular-nums" dir="ltr">{formatCurrency(total)}</span></div>

          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={collect} onChange={(e) => setCollect(e.target.checked)} className="h-4 w-4" /> {t('wholesale.collectNowLabel')}</label>
          {collect && (
            <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className={`${selectCls} w-full`}><option value="cash">{t('wholesale.optCash')}</option><option value="card">{t('wholesale.optCard')}</option></select>
          )}
          <Button className="w-full" disabled={pending || cart.length === 0 || !customerId} onClick={submit}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} {t('wholesale.btnIssueAndPrint')}</Button>
        </CardContent></Card>
      </div>
    </div>
  );
}
