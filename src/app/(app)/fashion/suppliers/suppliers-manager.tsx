'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n/provider';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/utils';
import { INTL_LOCALE } from '@/lib/i18n/config';
import type { Locale } from '@/lib/i18n/config';
import { createSupplier, paySupplier, createPurchase } from '../actions';
import { Plus, Wallet, Trash2, PackagePlus } from 'lucide-react';

interface Supplier { id: string; name: string; phone: string | null; balance: number }
interface Product { product_id: string; code: string; name: string; cost: number }
interface PLine { product_id: string; name: string; quantity: number; unit_cost: number }

export function SuppliersManager({ suppliers, products, locale }: { suppliers: Supplier[]; products: Product[]; locale: Locale }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [buyFor, setBuyFor] = useState<string | null>(null);
  const [lines, setLines] = useState<PLine[]>([]);
  const [pick, setPick] = useState('');
  const [payCash, setPayCash] = useState(false);
  const money = (n: number) => formatCurrency(n, 'EGP', INTL_LOCALE[locale]);

  const total = lines.reduce((s, l) => s + l.quantity * l.unit_cost, 0);

  function addLine() {
    const p = products.find((x) => x.product_id === pick);
    if (!p) return;
    setLines((ls) => ls.some((l) => l.product_id === p.product_id) ? ls : [...ls, { product_id: p.product_id, name: p.name, quantity: 1, unit_cost: p.cost }]);
    setPick('');
  }
  function submitPurchase(supplierId: string) {
    if (lines.length === 0) { toast.error(t('fashion.errors.emptyCart')); return; }
    start(async () => {
      const res = await createPurchase({ supplierId, payCash, lines: lines.map((l) => ({ product_id: l.product_id, quantity: l.quantity, unit_cost: l.unit_cost })) });
      if (res.ok) { toast.success(t('fashion.suppliers.saved')); setLines([]); setBuyFor(null); router.refresh(); } else toast.error(res.error || 'Error');
    });
  }

  return (
    <div className="space-y-4">
      <Card><CardContent className="p-4">
        <form onSubmit={(e) => { e.preventDefault(); const form = e.currentTarget; start(async () => { const res = await createSupplier(new FormData(form)); if (res.ok) { toast.success(t('fashion.suppliers.saved')); form.reset(); router.refresh(); } else toast.error(res.error || 'Error'); }); }} className="flex flex-wrap items-end gap-2">
          <Input name="name" placeholder={t('fashion.suppliers.name')} required className="min-w-40 flex-1" />
          <Input name="phone" placeholder={t('fashion.suppliers.phone')} className="min-w-40 flex-1" />
          <Button type="submit" disabled={pending}><Plus className="h-4 w-4" />{t('fashion.suppliers.new')}</Button>
        </form>
      </CardContent></Card>

      {suppliers.length === 0 ? (
        <p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">{t('fashion.suppliers.empty')}</p>
      ) : suppliers.map((s) => (
        <Card key={s.id}><CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><p className="font-medium">{s.name}</p>{s.phone && <p className="text-xs text-muted-foreground" dir="ltr">{s.phone}</p>}</div>
            <div className="flex items-center gap-3">
              <span className="text-sm">{t('fashion.suppliers.balance')}: <b className={`tabular-nums ${Number(s.balance) > 0 ? 'text-warning' : ''}`}>{money(Number(s.balance || 0))}</b></span>
              <Button size="sm" variant="outline" onClick={() => { setBuyFor(buyFor === s.id ? null : s.id); setLines([]); }}><PackagePlus className="h-4 w-4" />{t('fashion.suppliers.newPurchase')}</Button>
            </div>
          </div>

          {/* Pay supplier */}
          <form onSubmit={(e) => { e.preventDefault(); const form = e.currentTarget; start(async () => { const res = await paySupplier(new FormData(form)); if (res.ok) { toast.success(t('fashion.suppliers.saved')); form.reset(); router.refresh(); } else toast.error(res.error || 'Error'); }); }} className="mt-2 flex flex-wrap items-end gap-2">
            <input type="hidden" name="supplier_id" value={s.id} />
            <Input name="amount" type="number" step="0.01" placeholder={t('fashion.cashbox.amount')} required className="w-36" />
            <Button type="submit" size="sm" variant="secondary" disabled={pending}><Wallet className="h-4 w-4" />{t('fashion.suppliers.payment')}</Button>
          </form>

          {/* Purchase builder */}
          {buyFor === s.id && (
            <div className="mt-3 space-y-2 rounded-md border p-2">
              <div className="flex gap-2">
                <select value={pick} onChange={(e) => setPick(e.target.value)} className="h-9 flex-1 rounded-md border bg-background px-2 text-sm">
                  <option value="">—</option>{products.map((p) => <option key={p.product_id} value={p.product_id}>{p.name} ({p.code})</option>)}
                </select>
                <Button type="button" size="sm" variant="outline" onClick={addLine}><Plus className="h-4 w-4" /></Button>
              </div>
              {lines.map((l, i) => (
                <div key={l.product_id} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{l.name}</span>
                  <Input type="number" min={1} value={l.quantity} onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, quantity: Number(e.target.value) || 1 } : x))} className="w-16" />
                  <Input type="number" step="0.01" value={l.unit_cost} onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, unit_cost: Number(e.target.value) || 0 } : x))} className="w-24" />
                  <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}><Trash2 className="h-3 w-3" /></Button>
                </div>
              ))}
              <div className="flex items-center justify-between border-t pt-2 text-sm">
                <label className="flex items-center gap-2"><input type="checkbox" checked={payCash} onChange={(e) => setPayCash(e.target.checked)} />{t('fashion.suppliers.cash')}</label>
                <span className="font-bold tabular-nums">{money(total)}</span>
              </div>
              <Button type="button" className="w-full" disabled={pending} onClick={() => submitPurchase(s.id)}>{t('fashion.suppliers.newPurchase')}</Button>
            </div>
          )}
        </CardContent></Card>
      ))}
    </div>
  );
}
