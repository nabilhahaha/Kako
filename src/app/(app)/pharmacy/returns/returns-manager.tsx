'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n/provider';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Trash2, Undo2 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import type { Branch, ErpCustomer } from '@/lib/erp/types';
import { pharmacySearch, pharmacyBatches, type PharmacySearchRow, type PharmacyBatch } from '../pos/actions';
import { createPharmacyReturn } from './actions';

interface Line {
  product_id: string; code: string; name: string; name_ar: string | null;
  quantity: number; unit_price: number;
  batches: PharmacyBatch[]; batch_number: string; expiry_date: string | null;
}

export function ReturnsManager({ branches, customers, batchTracking, intlLocale }: {
  branches: Pick<Branch, 'id' | 'name' | 'name_ar'>[];
  customers: Pick<ErpCustomer, 'id' | 'name' | 'name_ar'>[];
  batchTracking: boolean;
  intlLocale: string;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const money = (n: number) => formatCurrency(n, 'EGP', intlLocale);
  const nm = (x: { name: string; name_ar: string | null }) => (locale === 'ar' ? x.name_ar || x.name : x.name);

  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? '');
  const [reason, setReason] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PharmacySearchRow[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) { setResults([]); return; }
    const id = setTimeout(async () => setResults(await pharmacySearch(q)), 160);
    return () => clearTimeout(id);
  }, [query]);

  async function addLine(r: PharmacySearchRow) {
    setQuery(''); setResults([]);
    if (lines.some((l) => l.product_id === r.product_id)) return;
    const batches = batchTracking ? await pharmacyBatches(r.product_id) : [];
    setLines((prev) => [...prev, {
      product_id: r.product_id, code: r.code, name: r.name, name_ar: r.name_ar,
      quantity: 1, unit_price: Number(r.sell_price),
      batches, batch_number: batches[0]?.batch_number ?? '', expiry_date: batches[0]?.expiry_date ?? null,
    }]);
  }
  const patch = (i: number, p: Partial<Line>) => setLines((arr) => arr.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const total = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);

  async function submit() {
    if (!branchId || !customerId || lines.length === 0) { toast.error(t('pharmReturns.incomplete')); return; }
    setBusy(true);
    const res = await createPharmacyReturn({
      branch_id: branchId, customer_id: customerId, reason: reason || undefined,
      lines: lines.map((l) => ({
        product_id: l.product_id, quantity: l.quantity, unit_price: l.unit_price,
        batch_number: l.batch_number || null, expiry_date: l.expiry_date || null,
      })),
    });
    setBusy(false);
    if (!res.ok) { toast.error(res.error ?? t('pharmReturns.error')); return; }
    toast.success(t('pharmReturns.done'));
    setLines([]); setReason('');
    router.refresh();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
      <Card><CardContent className="space-y-3 pt-5">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('pharmReturns.search')} className="h-11 ps-9" autoFocus />
        </div>
        {results.length > 0 && (
          <div className="max-h-56 space-y-1 overflow-y-auto">
            {results.map((r) => (
              <button key={r.product_id} onClick={() => addLine(r)} className="flex w-full items-center justify-between rounded-md border p-2 text-start text-sm hover:bg-secondary">
                <span className="truncate">{nm(r)}</span>
                <span className="text-xs text-muted-foreground" dir="ltr">{money(Number(r.sell_price))}</span>
              </button>
            ))}
          </div>
        )}

        <div className="space-y-2">
          {lines.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t('pharmReturns.empty')}</p>
          ) : lines.map((l, i) => (
            <div key={l.product_id} className="space-y-2 rounded-md border p-2">
              <div className="flex items-center justify-between">
                <span className="truncate text-sm font-medium">{nm(l)}</span>
                <button onClick={() => setLines((arr) => arr.filter((_, j) => j !== i))} className="rounded p-1 text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <label className="text-[11px] text-muted-foreground">{t('pharmReturns.qty')}
                  <Input type="number" min="1" value={l.quantity} onChange={(e) => patch(i, { quantity: Number(e.target.value) })} className="mt-0.5 h-9" dir="ltr" /></label>
                <label className="text-[11px] text-muted-foreground">{t('pharmReturns.price')}
                  <Input type="number" step="0.01" value={l.unit_price} onChange={(e) => patch(i, { unit_price: Number(e.target.value) })} className="mt-0.5 h-9" dir="ltr" /></label>
                {batchTracking && (
                  <label className="text-[11px] text-muted-foreground">{t('pharmReturns.batch')}
                    {l.batches.length > 0 ? (
                      <select value={l.batch_number}
                        onChange={(e) => { const b = l.batches.find((x) => (x.batch_number ?? '') === e.target.value); patch(i, { batch_number: e.target.value, expiry_date: b?.expiry_date ?? l.expiry_date }); }}
                        className="mt-0.5 h-9 w-full rounded-md border border-input bg-background px-1 text-sm" dir="ltr">
                        {l.batches.map((b) => <option key={b.id} value={b.batch_number ?? ''}>{b.batch_number ?? '—'}{b.expiry_date ? ` · ${b.expiry_date}` : ''}</option>)}
                        <option value="">{t('pharmReturns.otherBatch')}</option>
                      </select>
                    ) : (
                      <Input value={l.batch_number} onChange={(e) => patch(i, { batch_number: e.target.value })} className="mt-0.5 h-9" dir="ltr" />
                    )}
                  </label>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent></Card>

      <Card className="h-fit"><CardContent className="space-y-3 pt-5">
        {branches.length > 1 && (
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm">
            {branches.map((b) => <option key={b.id} value={b.id}>{nm(b)}</option>)}
          </select>
        )}
        <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm">
          {customers.map((c) => <option key={c.id} value={c.id}>{nm(c)}</option>)}
        </select>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('pharmReturns.reason')} className="h-10" />
        <div className="flex items-center justify-between border-t pt-3 text-sm">
          <span className="text-muted-foreground">{t('pharmReturns.total')}</span>
          <span className="font-bold" dir="ltr">{money(total)}</span>
        </div>
        <Button className="h-11 w-full" disabled={busy || lines.length === 0} onClick={submit}>
          <Undo2 className="h-4 w-4" /> {t('pharmReturns.submit')}
        </Button>
      </CardContent></Card>
    </div>
  );
}
