'use client';

import { useState, useTransition, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, Package } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { ProductCombobox, type ComboRow } from '@/components/shared/product-combobox';
import { useI18n } from '@/lib/i18n/provider';
import {
  listProductUoms,
  upsertProductUom,
  deleteProductUom,
  type ProductUomInput,
} from '@/app/(app)/fmcg/actions';

export function UomManager() {
  const { t } = useI18n();
  const [, startTransition] = useTransition();

  const [productId, setProductId] = useState<string | null>(null);
  const [productLabel, setProductLabel] = useState<string | null>(null);
  const [uoms, setUoms] = useState<ProductUomInput[]>([]);
  const [loading, setLoading] = useState(false);

  // New-row form.
  const [uom, setUom] = useState('');
  const [factor, setFactor] = useState('1');
  const [barcode, setBarcode] = useState('');
  const [isCase, setIsCase] = useState(false);

  const load = useCallback(
    async (pid: string) => {
      setLoading(true);
      const res = await listProductUoms(pid);
      setLoading(false);
      if (!res.ok || !res.data) {
        toast.error(res.error ?? t('fmcgw1.error'));
        setUoms([]);
        return;
      }
      setUoms(res.data);
    },
    [t],
  );

  useEffect(() => {
    if (productId) load(productId);
    else setUoms([]);
  }, [productId, load]);

  function add() {
    if (!productId || !uom.trim()) {
      toast.error(t('fmcgw1.error'));
      return;
    }
    startTransition(async () => {
      const res = await upsertProductUom({
        product_id: productId,
        uom: uom.trim(),
        factor: Number(factor) || 1,
        barcode: barcode.trim() || null,
        is_case: isCase,
      });
      if (!res.ok) {
        toast.error(res.error ?? t('fmcgw1.error'));
        return;
      }
      toast.success(t('fmcgw1.saved'));
      setUom('');
      setFactor('1');
      setBarcode('');
      setIsCase(false);
      load(productId);
    });
  }

  function remove(id?: string) {
    if (!id || !productId) return;
    startTransition(async () => {
      const res = await deleteProductUom(id);
      if (!res.ok) {
        toast.error(res.error ?? t('fmcgw1.error'));
        return;
      }
      toast.success(t('fmcgw1.deleted'));
      load(productId);
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-4">
          <div className="space-y-1">
            <Label>{t('fmcgw1.uomProduct')}</Label>
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
        </CardContent>
      </Card>

      {!productId ? (
        <EmptyState icon={<Package />} title={t('fmcgw1.uomPickProduct')} />
      ) : (
        <>
          <Card>
            <CardContent className="space-y-4 p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1">
                  <Label>{t('fmcgw1.uomCol')}</Label>
                  <Input value={uom} onChange={(e) => setUom(e.target.value)} placeholder="carton" />
                </div>
                <div className="space-y-1">
                  <Label>{t('fmcgw1.uomFactor')}</Label>
                  <Input type="number" min={0} step="0.0001" dir="ltr" value={factor} onChange={(e) => setFactor(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>{t('fmcgw1.uomBarcode')}</Label>
                  <Input value={barcode} onChange={(e) => setBarcode(e.target.value)} dir="ltr" />
                </div>
                <div className="flex items-end gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={isCase} onChange={(e) => setIsCase(e.target.checked)} className="h-4 w-4" />
                    {t('fmcgw1.uomIsCase')}
                  </label>
                </div>
              </div>
              <div className="sticky bottom-2 flex justify-end">
                <Button onClick={add}>
                  <Plus className="h-4 w-4" /> {t('fmcgw1.uomAdd')}
                </Button>
              </div>
            </CardContent>
          </Card>

          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : uoms.length === 0 ? (
            <EmptyState title={t('fmcgw1.uomEmpty')} />
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-secondary/50 text-muted-foreground">
                      <tr>
                        <th className="p-3 text-start font-medium">{t('fmcgw1.uomCol')}</th>
                        <th className="p-3 text-center font-medium">{t('fmcgw1.uomFactor')}</th>
                        <th className="p-3 text-start font-medium">{t('fmcgw1.uomBarcode')}</th>
                        <th className="p-3 text-center font-medium">{t('fmcgw1.uomIsCase')}</th>
                        <th className="p-3 text-center font-medium">{t('fmcgw1.actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {uoms.map((u) => (
                        <tr key={u.id} className="border-b">
                          <td className="p-3 font-medium">{u.uom}</td>
                          <td className="p-3 text-center tabular-nums" dir="ltr">{Number(u.factor)}</td>
                          <td className="p-3" dir="ltr">{u.barcode || '—'}</td>
                          <td className="p-3 text-center">
                            {u.is_case && <Badge variant="info">{t('fmcgw1.yes')}</Badge>}
                          </td>
                          <td className="p-3 text-center">
                            <Button variant="ghost" size="icon" onClick={() => remove(u.id)} aria-label={t('fmcgw1.delete')}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
