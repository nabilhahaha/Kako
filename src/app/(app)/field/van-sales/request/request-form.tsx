'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Trash2, Send } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/lib/i18n/provider';
import { submitStockRequest } from '../request-actions';

export interface WarehouseOpt { id: string; name: string; name_ar: string | null; is_van?: boolean | null }
export interface ProductOpt { id: string; name: string; name_ar: string | null; code: string }

interface Line { productId: string; quantity: number }

export function StockRequestForm({ van, warehouses, products }: { van: WarehouseOpt; warehouses: WarehouseOpt[]; products: ProductOpt[] }) {
  const { t, locale } = useI18n();
  const ar = locale === 'ar';
  const router = useRouter();
  const sources = warehouses.filter((w) => w.id !== van.id);
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? '');
  const [urgent, setUrgent] = useState(false);
  const [notes, setNotes] = useState('');
  const [loadingDate, setLoadingDate] = useState('');
  const [lines, setLines] = useState<Line[]>([{ productId: '', quantity: 1 }]);
  const [busy, setBusy] = useState(false);

  const pName = (p: ProductOpt) => (ar && p.name_ar ? p.name_ar : p.name);
  const wName = (w: WarehouseOpt) => (ar && w.name_ar ? w.name_ar : w.name);

  function setLine(i: number, patch: Partial<Line>) { setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l))); }

  async function submit() {
    const valid = lines.filter((l) => l.productId && l.quantity > 0);
    if (!sourceId) { toast.error(t('vanSales.request.pickSource')); return; }
    if (valid.length === 0) { toast.error(t('vanSales.request.noLines')); return; }
    setBusy(true);
    try {
      const res = await submitStockRequest({
        fromWarehouseId: sourceId, toWarehouseId: van.id, urgent, notes, requestedDate: loadingDate || undefined,
        lines: valid.map((l) => ({ productId: l.productId, quantity: l.quantity })),
      });
      if (!res.ok) { toast.error(res.error ?? t('vanSales.request.error')); return; }
      toast.success(t('vanSales.request.submitted'));
      router.push('/field/van-sales');
    } catch {
      toast.error(t('vanSales.request.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="space-y-1.5">
          <Label>{t('vanSales.request.source')}</Label>
          <Select value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
            <option value="">{t('vanSales.request.pickSource')}</option>
            {sources.map((w) => <option key={w.id} value={w.id}>{wName(w)}</option>)}
          </Select>
        </div>

        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex-1 space-y-1.5">
                <Label>{t('vanSales.request.product')}</Label>
                <Select value={l.productId} onChange={(e) => setLine(i, { productId: e.target.value })}>
                  <option value="">{t('vanSales.request.pickProduct')}</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{pName(p)}</option>)}
                </Select>
              </div>
              <div className="w-24 space-y-1.5">
                <Label>{t('vanSales.request.qty')}</Label>
                <Input type="number" inputMode="numeric" min={1} value={l.quantity} onChange={(e) => setLine(i, { quantity: Number(e.target.value) })} />
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} aria-label={t('vanSales.request.removeLine')}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" onClick={() => setLines((ls) => [...ls, { productId: '', quantity: 1 }])}>
            <Plus className="h-4 w-4" /> {t('vanSales.request.addLine')}
          </Button>
        </div>

        <div className="space-y-1.5">
          <Label>{t('vanSales.request.loadingDate')}</Label>
          <Input type="date" value={loadingDate} onChange={(e) => setLoadingDate(e.target.value)} />
        </div>

        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} /> {t('vanSales.request.urgent')}
        </label>

        <div className="space-y-1.5">
          <Label>{t('vanSales.request.notes')}</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <Button onClick={submit} loading={busy} className="w-full">
          {busy ? t('vanSales.request.submitting') : <><Send className="h-4 w-4" /> {t('vanSales.request.submit')}</>}
        </Button>
      </CardContent>
    </Card>
  );
}
