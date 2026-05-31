'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { quickSale } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { computeTotals } from '@/lib/erp/sales-calc';
import { PAYMENT_METHOD_OPTIONS } from '@/lib/erp/constants';
import { formatCurrency } from '@/lib/utils';
import { INTL_LOCALE } from '@/lib/i18n/config';
import type { Branch, ErpCustomer, PaymentMethod, ProductCatalog } from '@/lib/erp/types';
import { useI18n } from '@/lib/i18n/provider';
import { Search, Plus, Minus, Trash2, Loader2, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';

interface CartLine {
  product: ProductCatalog;
  quantity: number;
}

export function PosTerminal({
  customers,
  branches,
  products,
}: {
  customers: ErpCustomer[];
  branches: Branch[];
  products: ProductCatalog[];
}) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? '');
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [pay, setPay] = useState(true);
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? products.filter(
          (p) =>
            p.code.toLowerCase().includes(q) ||
            p.name.toLowerCase().includes(q) ||
            (p.name_ar || '').toLowerCase().includes(q) ||
            (p.barcode || '').toLowerCase().includes(q),
        )
      : products;
    return list.slice(0, 50);
  }, [products, query]);

  function addToCart(p: ProductCatalog) {
    setCart((prev) => {
      const existing = prev.find((l) => l.product.id === p.id);
      if (existing) return prev.map((l) => (l.product.id === p.id ? { ...l, quantity: l.quantity + 1 } : l));
      return [...prev, { product: p, quantity: 1 }];
    });
  }
  function setQty(id: string, qty: number) {
    if (qty <= 0) return setCart((prev) => prev.filter((l) => l.product.id !== id));
    setCart((prev) => prev.map((l) => (l.product.id === id ? { ...l, quantity: qty } : l)));
  }

  const lineInputs = cart.map((l) => ({
    product_id: l.product.id,
    quantity: l.quantity,
    unit_price: Number(l.product.sell_price),
    discount_pct: 0,
    tax_rate: Number(l.product.tax_rate),
  }));
  const totals = computeTotals(lineInputs);

  const canSell = branchId && customerId && cart.length > 0;

  function complete() {
    startTransition(async () => {
      const res = await quickSale({
        branch_id: branchId,
        customer_id: customerId,
        lines: lineInputs,
        pay,
        amount: pay ? totals.net_amount : 0,
        payment_method: method,
      });
      if (!res.ok) {
        toast.error(res.error ?? t('sales.errorGeneric'));
        return;
      }
      toast.success(t('sales.posSuccessMsg', { number: res.data?.invoice_number ?? '', collected: pay ? t('sales.posSuccessCollected') : '' }));
      setCart([]);
      setQuery('');
      router.refresh();
    });
  }

  if (branches.length === 0 || customers.length === 0 || products.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          {t('sales.posNeedData')}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
      {/* Products */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('sales.posSearchPlaceholder')} className="ps-9" autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {filtered.map((p) => (
            <button
              key={p.id}
              onClick={() => addToCart(p)}
              className="rounded-lg border p-3 text-start transition-colors hover:border-primary/50 hover:bg-secondary/40"
            >
              <p className="line-clamp-2 text-sm font-medium">{p.name_ar || p.name}</p>
              <p className="mt-1 text-xs text-muted-foreground" dir="ltr">{p.code}</p>
              <p className="mt-1 font-bold tabular-nums text-primary" dir="ltr">{formatCurrency(p.sell_price, 'EGP', INTL_LOCALE[locale])}</p>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="col-span-full p-6 text-center text-sm text-muted-foreground">{t('sales.posNoResults')}</p>
          )}
        </div>
      </div>

      {/* Cart */}
      <Card className="sticky top-4 h-fit">
        <CardContent className="space-y-3 pt-5">
          <div className="grid gap-2">
            {branches.length > 1 && (
              <div className="space-y-1">
                <Label className="text-xs">{t('sales.labelBranch')}</Label>
                <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name_ar || b.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">{t('sales.labelCustomer')}</Label>
              <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name_ar || c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="max-h-[40vh] space-y-1 overflow-y-auto border-y py-2">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center gap-1 py-6 text-center text-sm text-muted-foreground">
                <ShoppingBag className="h-6 w-6" />
                <p>{t('sales.posCartEmpty')}</p>
              </div>
            ) : (
              cart.map((l) => (
                <div key={l.product.id} className="flex items-center gap-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{l.product.name_ar || l.product.name}</p>
                    <p className="text-xs text-muted-foreground tabular-nums" dir="ltr">
                      {formatCurrency(l.product.sell_price, 'EGP', INTL_LOCALE[locale])} × {l.quantity}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setQty(l.product.id, l.quantity - 1)} className="rounded p-1 hover:bg-secondary"><Minus className="h-3.5 w-3.5" /></button>
                    <input
                      type="number" min="0" value={l.quantity}
                      onChange={(e) => setQty(l.product.id, Number(e.target.value))}
                      className="h-7 w-12 rounded border border-input bg-background text-center text-sm" dir="ltr"
                    />
                    <button onClick={() => setQty(l.product.id, l.quantity + 1)} className="rounded p-1 hover:bg-secondary"><Plus className="h-3.5 w-3.5" /></button>
                    <button onClick={() => setQty(l.product.id, 0)} className="rounded p-1 text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="space-y-1 text-sm">
            <Row label={t('sales.posTotal')} value={formatCurrency(totals.total_amount, 'EGP', INTL_LOCALE[locale])} />
            <Row label={t('sales.posTax')} value={formatCurrency(totals.tax_amount, 'EGP', INTL_LOCALE[locale])} />
            <div className="flex justify-between border-t pt-1 text-base font-bold">
              <span>{t('sales.posGrandTotal')}</span>
              <span dir="ltr" className="tabular-nums">{formatCurrency(totals.net_amount, 'EGP', INTL_LOCALE[locale])}</span>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={pay} onChange={(e) => setPay(e.target.checked)} className="h-4 w-4" />
            {t('sales.posCollectNow')}
          </label>
          {pay && (
            <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
              {PAYMENT_METHOD_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>{m[locale]}</option>
              ))}
            </select>
          )}

          <Button className="w-full" size="lg" disabled={!canSell || pending} onClick={complete}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {pay ? t('sales.posBtnCompleteAndCollect') : t('sales.posBtnCompleteDeferred')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <span>{label}</span>
      <span dir="ltr" className="tabular-nums">{value}</span>
    </div>
  );
}
