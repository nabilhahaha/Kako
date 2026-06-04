'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Trash2, Calculator } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { ProductCombobox, type ComboRow } from '@/components/shared/product-combobox';
import { useI18n } from '@/lib/i18n/provider';
import { formatCurrency, formatDate } from '@/lib/utils';
import { previewResolvedPrice } from '@/lib/erp/price-book-preview';
import { upsertPrice, deletePrice } from '@/app/(app)/fmcg/actions';

export interface PriceBookRow {
  id: string;
  product_id: string;
  uom: string;
  channel_id: string | null;
  customer_id: string | null;
  min_qty: number;
  price: number;
  currency: string | null;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
}

const TODAY = new Date().toISOString().slice(0, 10);

export function PriceBookManager({
  rows,
  productLabels,
  canManage,
}: {
  rows: PriceBookRow[];
  productLabels: Record<string, string>;
  canManage: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [, startTransition] = useTransition();

  // New-row form state.
  const [productId, setProductId] = useState<string | null>(null);
  const [productLabel, setProductLabel] = useState<string | null>(null);
  const [uom, setUom] = useState('');
  const [minQty, setMinQty] = useState('1');
  const [price, setPrice] = useState('');
  const [from, setFrom] = useState(TODAY);
  const [to, setTo] = useState('');

  // Preview state.
  const [previewQty, setPreviewQty] = useState('1');

  function add() {
    if (!productId || !uom.trim() || !price) {
      toast.error(t('fmcgw1.error'));
      return;
    }
    startTransition(async () => {
      const res = await upsertPrice({
        product_id: productId,
        uom: uom.trim(),
        min_qty: Number(minQty) || 1,
        price: Number(price),
        effective_from: from,
        effective_to: to || null,
      });
      if (!res.ok) {
        toast.error(res.error ?? t('fmcgw1.error'));
        return;
      }
      toast.success(t('fmcgw1.saved'));
      setUom('');
      setMinQty('1');
      setPrice('');
      router.refresh();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const res = await deletePrice(id);
      if (!res.ok) {
        toast.error(res.error ?? t('fmcgw1.error'));
        return;
      }
      toast.success(t('fmcgw1.deleted'));
      router.refresh();
    });
  }

  // Resolved-price preview for the selected product/uom, computed client-side
  // with the shared pricing engine over the rows we already hold.
  const preview =
    productId && uom.trim()
      ? previewResolvedPrice(rows, productId, uom.trim(), Number(previewQty) || 1)
      : null;

  return (
    <div className="space-y-6">
      {canManage && (
        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
              <div className="space-y-1 sm:col-span-2 lg:col-span-2">
                <Label>{t('fmcgw1.priceProduct')}</Label>
                <ProductCombobox
                  value={productId}
                  selectedLabel={productLabel}
                  placeholder={t('fmcgw1.selectProduct')}
                  onSelect={(id, row: ComboRow | null) => {
                    setProductId(id);
                    setProductLabel(row?.primary ?? null);
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label>{t('fmcgw1.priceUom')}</Label>
                <Input value={uom} onChange={(e) => setUom(e.target.value)} placeholder="piece" />
              </div>
              <div className="space-y-1">
                <Label>{t('fmcgw1.priceMinQty')}</Label>
                <Input type="number" min={1} dir="ltr" value={minQty} onChange={(e) => setMinQty(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>{t('fmcgw1.priceValue')}</Label>
                <Input type="number" min={0} step="0.01" dir="ltr" value={price} onChange={(e) => setPrice(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>{t('fmcgw1.priceFrom')}</Label>
                <Input type="date" dir="ltr" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>{t('fmcgw1.priceTo')}</Label>
                <Input type="date" dir="ltr" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </div>

            {/* Resolved-price preview (pricing engine). */}
            {productId && uom.trim() && (
              <div className="flex flex-wrap items-end gap-3 rounded-md border bg-secondary/40 p-3">
                <div className="space-y-1">
                  <Label className="flex items-center gap-1"><Calculator className="h-3.5 w-3.5" /> {t('fmcgw1.pricePreviewQty')}</Label>
                  <Input type="number" min={1} dir="ltr" value={previewQty} onChange={(e) => setPreviewQty(e.target.value)} className="w-28" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{t('fmcgw1.pricePreviewResult')}</p>
                  <p className="text-lg font-bold tabular-nums" dir="ltr">{formatCurrency(preview ?? 0)}</p>
                </div>
                <p className="basis-full text-xs text-muted-foreground">{t('fmcgw1.pricePreviewHint')}</p>
              </div>
            )}

            <div className="sticky bottom-2 flex justify-end">
              <Button onClick={add}>
                <Plus className="h-4 w-4" /> {t('fmcgw1.priceAdd')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {rows.length === 0 ? (
        <EmptyState title={t('fmcgw1.priceEmpty')} />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="p-3 text-start font-medium">{t('fmcgw1.priceProduct')}</th>
                    <th className="p-3 text-start font-medium">{t('fmcgw1.priceUom')}</th>
                    <th className="p-3 text-center font-medium">{t('fmcgw1.priceMinQty')}</th>
                    <th className="p-3 text-center font-medium">{t('fmcgw1.priceValue')}</th>
                    <th className="p-3 text-center font-medium">{t('fmcgw1.priceFrom')}</th>
                    <th className="p-3 text-center font-medium">{t('fmcgw1.priceTo')}</th>
                    <th className="p-3 text-center font-medium">{t('fmcgw1.priceActive')}</th>
                    {canManage && <th className="p-3 text-center font-medium">{t('fmcgw1.actions')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b">
                      <td className="p-3 font-medium">{productLabels[r.product_id] ?? '—'}</td>
                      <td className="p-3">{r.uom}</td>
                      <td className="p-3 text-center tabular-nums" dir="ltr">{Number(r.min_qty)}</td>
                      <td className="p-3 text-center tabular-nums" dir="ltr">{formatCurrency(r.price, r.currency ?? 'EGP')}</td>
                      <td className="p-3 text-center" dir="ltr">{formatDate(r.effective_from)}</td>
                      <td className="p-3 text-center" dir="ltr">{r.effective_to ? formatDate(r.effective_to) : '—'}</td>
                      <td className="p-3 text-center">
                        <Badge variant={r.is_active ? 'success' : 'secondary'}>
                          {r.is_active ? t('fmcgw1.yes') : t('fmcgw1.no')}
                        </Badge>
                      </td>
                      {canManage && (
                        <td className="p-3 text-center">
                          <Button variant="ghost" size="icon" onClick={() => remove(r.id)} aria-label={t('fmcgw1.delete')}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
