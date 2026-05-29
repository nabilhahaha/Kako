'use client';

import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { ScanBarcode, Plus, Minus, Trash2, Loader2, ShoppingCart } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import type { PaymentMethod } from '@/lib/erp/types';
import { cashierCheckout } from '../actions';

export interface CashierProduct { id: string; code: string; name: string; name_ar: string | null; barcode: string | null; sell_price: number; unit: string; tax_rate: number }
export interface BranchOption { id: string; name: string; name_ar: string | null }

interface Line { product: CashierProduct; qty: number }

export function CashierTerminal({ branches, products }: { branches: BranchOption[]; products: CashierProduct[] }) {
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<Line[]>([]);
  const [method, setMethod] = useState<PaymentMethod>('cash' as PaymentMethod);
  const [paid, setPaid] = useState('');
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return products.filter((p) =>
      p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) ||
      (p.name_ar || '').toLowerCase().includes(q) || (p.barcode || '').toLowerCase().includes(q),
    ).slice(0, 24);
  }, [products, query]);

  const total = cart.reduce((s, l) => s + l.qty * Number(l.product.sell_price), 0);
  const paidNum = Number(paid || 0);
  const change = method === 'cash' && paidNum > 0 ? paidNum - total : 0;

  function add(p: CashierProduct) {
    setCart((prev) => {
      const ex = prev.find((l) => l.product.id === p.id);
      if (ex) return prev.map((l) => l.product.id === p.id ? { ...l, qty: l.qty + 1 } : l);
      return [...prev, { product: p, qty: 1 }];
    });
  }
  function setQty(id: string, qty: number) {
    if (qty <= 0) return setCart((prev) => prev.filter((l) => l.product.id !== id));
    setCart((prev) => prev.map((l) => l.product.id === id ? { ...l, qty } : l));
  }
  function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    const q = query.trim().toLowerCase();
    if (!q) return;
    const exact = products.find((p) => (p.barcode || '').toLowerCase() === q || p.code.toLowerCase() === q);
    const pick = exact ?? (filtered.length === 1 ? filtered[0] : null);
    if (pick) { add(pick); setQuery(''); }
  }

  function checkout() {
    if (cart.length === 0) return;
    if (!branchId) { toast.error('اختر الفرع'); return; }
    startTransition(async () => {
      const res = await cashierCheckout({
        branch_id: branchId,
        payment_method: method,
        // Shelf prices are final (tax-inclusive), so the charged net matches the
        // displayed cart total — no separate VAT added on top.
        lines: cart.map((l) => ({ product_id: l.product.id, quantity: l.qty, unit_price: Number(l.product.sell_price), discount_pct: 0, tax_rate: 0 })),
      });
      if (!res.ok || !res.data) { toast.error(res.error ?? 'تعذّر إتمام البيع'); return; }
      const ch = method === 'cash' && paidNum > 0 ? paidNum - res.data.net : 0;
      toast.success(ch > 0 ? `تم البيع — الباقي ${ch.toLocaleString('ar-EG')} ج.م` : 'تم البيع');
      setCart([]); setPaid('');
      window.open(`/print/receipt/${res.data.invoice_id}`, '_blank');
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      {/* Search + results */}
      <div className="lg:col-span-3 space-y-3">
        <div className="flex gap-2">
          {branches.length > 1 && (
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="h-10 rounded-md border border-input bg-background px-2 text-sm">
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name_ar || b.name}</option>)}
            </select>
          )}
          <div className="relative flex-1">
            <ScanBarcode className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onSearchKey} placeholder="امسح الباركود أو ابحث بالاسم/الكود ثم Enter…" className="pr-9" />
          </div>
        </div>
        {filtered.length > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {filtered.map((p) => (
              <button key={p.id} onClick={() => { add(p); setQuery(''); }}
                className="flex flex-col items-center gap-1 rounded-lg border bg-card p-3 text-center text-sm hover:border-primary/50 hover:bg-secondary">
                <span className="font-medium leading-tight">{p.name_ar || p.name}</span>
                <span className="tabular-nums text-xs text-muted-foreground" dir="ltr">{formatCurrency(p.sell_price)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Cart */}
      <div className="lg:col-span-2">
        <Card><CardContent className="space-y-3 p-4">
          <h2 className="flex items-center gap-2 font-semibold"><ShoppingCart className="h-4 w-4" /> السلة</h2>
          {cart.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">السلة فارغة — امسح صنفاً.</p>
          ) : (
            <ul className="divide-y">
              {cart.map((l) => (
                <li key={l.product.id} className="py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate font-medium">{l.product.name_ar || l.product.name}</span>
                    <span className="shrink-0 tabular-nums text-sm" dir="ltr">{formatCurrency(l.qty * Number(l.product.sell_price))}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-1">
                    <Button size="icon" variant="outline" className="h-6 w-6" onClick={() => setQty(l.product.id, l.qty - 1)}>{l.qty <= 1 ? <Trash2 className="h-3 w-3" /> : <Minus className="h-3 w-3" />}</Button>
                    <Input type="number" step="any" min={0} value={l.qty} onChange={(e) => setQty(l.product.id, Number(e.target.value))} className="h-7 w-16 text-center" dir="ltr" />
                    <Button size="icon" variant="outline" className="h-6 w-6" onClick={() => setQty(l.product.id, l.qty + 1)}><Plus className="h-3 w-3" /></Button>
                    {l.product.unit && l.product.unit !== 'piece' && <span className="text-xs text-muted-foreground">{l.product.unit}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center justify-between border-t pt-2 text-lg font-bold">
            <span>الإجمالي</span><span className="tabular-nums" dir="ltr">{formatCurrency(total)}</span>
          </div>

          <div className="flex gap-2">
            <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className="h-10 flex-1 rounded-md border border-input bg-background px-2 text-sm">
              <option value="cash">كاش</option><option value="card">فيزا</option>
            </select>
            {method === 'cash' && (
              <div className="flex-1 space-y-0.5">
                <Input type="number" min={0} step="any" value={paid} onChange={(e) => setPaid(e.target.value)} placeholder="المدفوع" dir="ltr" className="h-10" />
              </div>
            )}
          </div>
          {method === 'cash' && paidNum > 0 && (
            <div className={`flex items-center justify-between text-sm font-medium ${change < 0 ? 'text-destructive' : 'text-success'}`}>
              <span>الباقي</span><span className="tabular-nums" dir="ltr">{formatCurrency(change)}</span>
            </div>
          )}

          <Button className="w-full" disabled={pending || cart.length === 0} onClick={checkout}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanBarcode className="h-4 w-4" />} إنهاء البيع وطباعة
          </Button>
        </CardContent></Card>
      </div>
    </div>
  );
}
