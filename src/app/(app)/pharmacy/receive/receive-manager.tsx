'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n/provider';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Search, PackageCheck } from 'lucide-react';
import { pharmacySearch, productUnits, receiveBatch } from './actions';
import type { PharmacySearchRow } from '../pos/actions';

export function ReceiveManager({ suppliers, batchTracking, expiryTracking }: {
  suppliers: Array<{ id: string; name: string; name_ar: string | null }>;
  batchTracking: boolean;
  expiryTracking: boolean;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const nm = (x: { name: string; name_ar: string | null }) => (locale === 'ar' ? x.name_ar || x.name : x.name);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PharmacySearchRow[]>([]);
  const [product, setProduct] = useState<PharmacySearchRow | null>(null);
  const [units, setUnits] = useState<{ base: string; purchase: string; units: string[] }>({ base: 'unit', purchase: 'unit', units: ['unit'] });
  const [uom, setUom] = useState('unit');
  const [qty, setQty] = useState('');
  const [cost, setCost] = useState('');
  const [batch, setBatch] = useState('');
  const [expiry, setExpiry] = useState('');
  const [supplier, setSupplier] = useState('');
  const [pending, start] = useTransition();

  useEffect(() => {
    const q = query.trim();
    if (q.length < 1 || product) { setResults([]); return; }
    const id = setTimeout(async () => setResults(await pharmacySearch(q)), 160);
    return () => clearTimeout(id);
  }, [query, product]);

  async function pick(r: PharmacySearchRow) {
    setProduct(r); setQuery(''); setResults([]);
    const u = await productUnits(r.product_id);
    setUnits(u); setUom(u.purchase);
  }

  function submit() {
    if (!product || !(Number(qty) > 0)) { toast.error(t('pharmReceive.needQty')); return; }
    start(async () => {
      const res = await receiveBatch({
        product_id: product.product_id, qty: Number(qty), uom,
        batch_number: batch || null, expiry_date: expiry || null,
        cost_price: cost ? Number(cost) : null, supplier_id: supplier || null,
      });
      if (!res.ok) { toast.error(res.error ?? t('pharmReceive.error')); return; }
      toast.success(t('pharmReceive.received'));
      setQty(''); setCost(''); setBatch(''); setExpiry('');
      router.refresh();
    });
  }

  return (
    <Card className="max-w-2xl"><CardContent className="space-y-4 p-4">
      {!product ? (
        <div className="space-y-2">
          <Label>{t('pharmReceive.product')}</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('pharmReceive.search')} className="h-11 ps-9" autoFocus />
          </div>
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {results.map((r) => (
              <button key={r.product_id} onClick={() => pick(r)} className="flex w-full items-center justify-between rounded-md border p-2 text-start text-sm hover:bg-secondary">
                <span className="truncate">{nm(r)}</span>
                <span className="text-xs text-muted-foreground" dir="ltr">{r.on_hand}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between rounded-md bg-muted/40 p-2">
            <span className="font-medium">{nm(product)}</span>
            <Button variant="ghost" size="sm" onClick={() => setProduct(null)}>{t('pharmReceive.change')}</Button>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <label className="text-xs">{t('pharmReceive.qty')}
              <Input type="number" step="0.001" value={qty} onChange={(e) => setQty(e.target.value)} className="mt-1 h-10" dir="ltr" autoFocus /></label>
            <label className="text-xs">{t('pharmReceive.unit')}
              <select value={uom} onChange={(e) => setUom(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 text-sm">
                {units.units.map((u) => <option key={u} value={u}>{u}{u === units.base ? ` (${t('pharmReceive.base')})` : ''}</option>)}
              </select></label>
            <label className="text-xs">{t('pharmReceive.cost')}
              <Input type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} className="mt-1 h-10" dir="ltr" /></label>
            {batchTracking && (
              <label className="text-xs">{t('pharmReceive.batch')}
                <Input value={batch} onChange={(e) => setBatch(e.target.value)} className="mt-1 h-10" dir="ltr" /></label>
            )}
            {batchTracking && expiryTracking && (
              <label className="text-xs">{t('pharmReceive.expiry')}
                <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className="mt-1 h-10" dir="ltr" /></label>
            )}
            {suppliers.length > 0 && (
              <label className="text-xs">{t('pharmReceive.supplier')}
                <select value={supplier} onChange={(e) => setSupplier(e.target.value)} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-2 text-sm">
                  <option value="">—</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{nm(s)}</option>)}
                </select></label>
            )}
          </div>
          {Number(qty) > 0 && uom !== units.base && (
            <p className="text-xs text-muted-foreground">{t('pharmReceive.willStore', { uom: units.base })}</p>
          )}
          <Button className="h-11 w-full" disabled={pending} onClick={submit}>
            <PackageCheck className="h-4 w-4" /> {t('pharmReceive.receiveBtn')}
          </Button>
        </>
      )}
    </CardContent></Card>
  );
}
