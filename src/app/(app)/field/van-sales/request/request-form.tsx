'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Send, Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/lib/i18n/provider';
import { submitStockRequest } from '../request-actions';

export interface WarehouseOpt { id: string; name: string; name_ar: string | null; is_van?: boolean | null }
export interface ProductOpt { id: string; name: string; name_ar: string | null; code: string }

export function StockRequestForm({
  van, warehouses, products, vanBalance, warehouseStock, pending, canViewStock,
}: {
  van: WarehouseOpt;
  warehouses: WarehouseOpt[];
  products: ProductOpt[];
  vanBalance: Record<string, number>;
  warehouseStock: Record<string, Record<string, number>>;
  pending: Record<string, number>;
  canViewStock: boolean;
}) {
  const { t, locale } = useI18n();
  const ar = locale === 'ar';
  const router = useRouter();
  const sources = warehouses.filter((w) => w.id !== van.id);
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? '');
  const [urgent, setUrgent] = useState(false);
  const [notes, setNotes] = useState('');
  const [loadingDate, setLoadingDate] = useState('');
  const [q, setQ] = useState('');
  const [qty, setQty] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  const pName = (p: ProductOpt) => (ar && p.name_ar ? p.name_ar : p.name);
  const wName = (w: WarehouseOpt) => (ar && w.name_ar ? w.name_ar : w.name);
  const whAvail = (productId: string) => warehouseStock[sourceId]?.[productId] ?? 0;
  const num = (n: number) => (n === 0 ? '—' : n.toLocaleString());

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return products;
    return products.filter((p) => pName(p).toLowerCase().includes(term) || (p.code ?? '').toLowerCase().includes(term));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, q, ar]);

  const requestedTotal = useMemo(() => Object.values(qty).reduce((s, v) => s + (Number(v) || 0), 0), [qty]);
  const requestedLines = useMemo(() => Object.entries(qty).filter(([, v]) => Number(v) > 0).length, [qty]);

  function setQ1(productId: string, raw: number) {
    const v = Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
    setQty((m) => ({ ...m, [productId]: v }));
  }

  async function submit() {
    if (!sourceId) { toast.error(t('vanSales.request.pickSource')); return; }
    const lines = products.filter((p) => (qty[p.id] ?? 0) > 0).map((p) => ({ productId: p.id, quantity: qty[p.id] }));
    if (lines.length === 0) { toast.error(t('vanSales.request.noLines')); return; }
    setBusy(true);
    try {
      const res = await submitStockRequest({ fromWarehouseId: sourceId, toWarehouseId: van.id, urgent, notes, requestedDate: loadingDate || undefined, lines });
      if (!res.ok) { toast.error(res.error ?? t('vanSales.request.error')); return; }
      toast.success(t('vanSales.request.submitted'));
      router.push('/field/van-sales/requests');
    } catch {
      toast.error(t('vanSales.request.error'));
    } finally {
      setBusy(false);
    }
  }

  const cols = canViewStock ? 5 : 4;

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        {/* Source + loading date + urgent + notes */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t('vanSales.request.source')}</Label>
            <Select value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
              <option value="">{t('vanSales.request.pickSource')}</option>
              {sources.map((w) => <option key={w.id} value={w.id}>{wName(w)}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t('vanSales.request.loadingDate')}</Label>
            <Input type="date" value={loadingDate} onChange={(e) => setLoadingDate(e.target.value)} />
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('vanSales.request.searchSku')} className="ps-9" />
        </div>

        {/* SKU table — every active SKU, with the full picture. */}
        <div className="rounded-md border">
          {/* Mobile: stacked rows. */}
          <ul className="divide-y sm:hidden">
            {filtered.map((p) => (
              <li key={p.id} className="space-y-1 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-medium">{pName(p)}{p.code && <span className="ms-1 font-mono text-[11px] text-muted-foreground" dir="ltr">{p.code}</span>}</span>
                  <Input type="number" inputMode="numeric" min={0} value={qty[p.id] ? qty[p.id] : ''} placeholder="0" onChange={(e) => setQ1(p.id, Number(e.target.value))} className="w-20 shrink-0" aria-label={t('vanSales.request.requestedQty')} />
                </div>
                <div className="flex flex-wrap gap-x-3 text-[11px] text-muted-foreground" dir="ltr">
                  <span>{t('vanSales.request.vanBalance')}: {num(vanBalance[p.id] ?? 0)}</span>
                  <span>{t('vanSales.request.pendingLoad')}: {num(pending[p.id] ?? 0)}</span>
                  {canViewStock && <span>{t('vanSales.request.whAvailable')}: {num(whAvail(p.id))}</span>}
                </div>
              </li>
            ))}
            {filtered.length === 0 && <li className="p-4 text-center text-sm text-muted-foreground">{t('vanSales.request.noSkus')}</li>}
          </ul>
          {/* Desktop: table. */}
          <div className="hidden overflow-x-auto sm:block"><table className="w-full text-sm">
            <thead className="border-b bg-secondary/50 text-muted-foreground"><tr>
              <th className="p-2 text-start font-medium">{t('vanSales.request.product')}</th>
              <th className="p-2 text-end font-medium">{t('vanSales.request.vanBalance')}</th>
              <th className="p-2 text-end font-medium">{t('vanSales.request.pendingLoad')}</th>
              {canViewStock && <th className="p-2 text-end font-medium">{t('vanSales.request.whAvailable')}</th>}
              <th className="p-2 text-end font-medium">{t('vanSales.request.requestedQty')}</th>
            </tr></thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="p-2">{pName(p)}{p.code && <span className="ms-1 font-mono text-[11px] text-muted-foreground" dir="ltr">{p.code}</span>}</td>
                  <td className="p-2 text-end tabular-nums" dir="ltr">{num(vanBalance[p.id] ?? 0)}</td>
                  <td className="p-2 text-end tabular-nums text-muted-foreground" dir="ltr">{num(pending[p.id] ?? 0)}</td>
                  {canViewStock && <td className="p-2 text-end tabular-nums" dir="ltr">{num(whAvail(p.id))}</td>}
                  <td className="p-2 text-end">
                    <Input type="number" inputMode="numeric" min={0} value={qty[p.id] ? qty[p.id] : ''} placeholder="0" onChange={(e) => setQ1(p.id, Number(e.target.value))} className="ms-auto w-20 text-end" aria-label={t('vanSales.request.requestedQty')} />
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={cols} className="p-4 text-center text-muted-foreground">{t('vanSales.request.noSkus')}</td></tr>}
            </tbody>
            <tfoot className="border-t-2 font-bold">
              <tr>
                <td className="p-2" colSpan={cols - 1}>{t('vanSales.request.totalRequested')} ({requestedLines})</td>
                <td className="p-2 text-end tabular-nums" dir="ltr">{requestedTotal.toLocaleString()}</td>
              </tr>
            </tfoot>
          </table></div>
        </div>

        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} /> {t('vanSales.request.urgent')}
        </label>
        <div className="space-y-1.5">
          <Label>{t('vanSales.request.notes')}</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <Button onClick={submit} loading={busy} disabled={requestedLines === 0} className="w-full">
          {busy ? t('vanSales.request.submitting') : <><Send className="h-4 w-4" /> {t('vanSales.request.submit')} ({requestedLines})</>}
        </Button>
      </CardContent>
    </Card>
  );
}
