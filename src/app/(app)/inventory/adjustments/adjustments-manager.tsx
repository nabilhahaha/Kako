'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { postAdjustment, approveAdjustment, rejectAdjustment, reverseAdjustment } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useConfirm } from '@/components/confirm-dialog';
import { formatNumber, formatDate, formatCurrency } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/provider';
import type { Warehouse } from '@/lib/erp/types';
import { Loader2, Plus, CheckCircle2, XCircle, Undo2 } from 'lucide-react';
import { toast } from 'sonner';

export interface ProductOption {
  id: string;
  code: string;
  name: string;
  name_ar: string | null;
  cost_price: number;
}
export interface AdjustmentRow {
  id: string;
  adjustment_qty: number;
  unit_cost: number;
  reason: string | null;
  status: 'pending' | 'posted' | 'rejected' | 'reversed';
  created_at: string;
  product: { code: string; name: string; name_ar: string | null } | null;
  warehouse: { code: string; name: string; name_ar: string | null } | null;
}

const STATUS_VARIANT: Record<AdjustmentRow['status'], 'secondary' | 'success' | 'destructive' | 'warning'> = {
  pending: 'warning',
  posted: 'success',
  rejected: 'destructive',
  reversed: 'secondary',
};
const STATUS_KEY: Record<AdjustmentRow['status'], string> = {
  pending: 'ops.statusPending',
  posted: 'ops.statusPosted',
  rejected: 'ops.statusRejected',
  reversed: 'ops.statusReversed',
};

export function AdjustmentsManager({
  warehouses,
  products,
  adjustments,
}: {
  warehouses: Warehouse[];
  products: ProductOption[];
  adjustments: AdjustmentRow[];
}) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const confirm = useConfirm();
  const pick = (en: string, ar: string | null) => (locale === 'ar' ? ar || en : en);

  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? '');
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [pending, startTransition] = useTransition();

  const selectedProduct = products.find((p) => p.id === productId);
  const previewValue = selectedProduct ? Math.abs(Number(qty || 0)) * Number(selectedProduct.cost_price) : 0;

  function onPost() {
    const q = Number(qty);
    if (!warehouseId || !productId) {
      toast.error(t('ops.adjProduct'));
      return;
    }
    if (!q || Number.isNaN(q)) {
      toast.error(t('ops.adjQty'));
      return;
    }
    startTransition(async () => {
      const res = await postAdjustment(warehouseId, productId, q, reason.trim() || null);
      if (!res.ok) {
        toast.error(res.error ?? '');
        return;
      }
      toast.success(res.data?.status === 'pending' ? t('ops.toastQueued') : t('ops.toastPosted'));
      setQty('');
      setReason('');
      setProductId('');
      router.refresh();
    });
  }

  function runAction(fn: () => Promise<{ ok: boolean; error?: string }>, successKey: string) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error ?? '');
        return;
      }
      toast.success(t(successKey));
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {/* New adjustment form */}
      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{t('ops.adjWarehouse')}</span>
            <select
              className="h-10 rounded-md border bg-background px-3"
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {pick(w.name, w.name_ar)} ({w.code})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{t('ops.adjProduct')}</span>
            <select
              className="h-10 rounded-md border bg-background px-3"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
            >
              <option value="">—</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {pick(p.name, p.name_ar)} ({p.code})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{t('ops.adjQty')}</span>
            <Input
              type="number"
              inputMode="decimal"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              dir="ltr"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{t('ops.adjReason')}</span>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <div className="flex items-end justify-between gap-2 sm:col-span-2 lg:col-span-4">
            {selectedProduct && qty ? (
              <span className="text-sm text-muted-foreground">
                {t('ops.adjValue')}: <b dir="ltr">{formatCurrency(previewValue)}</b>
              </span>
            ) : <span />}
            <Button onClick={onPost} disabled={pending} className="gap-1.5">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {t('ops.adjSubmit')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Adjustments list */}
      {adjustments.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t('ops.adjEmpty')}</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="p-3 text-start font-medium">{t('ops.movDate')}</th>
                    <th className="p-3 text-start font-medium">{t('ops.adjProduct')}</th>
                    <th className="p-3 text-start font-medium">{t('ops.adjWarehouse')}</th>
                    <th className="p-3 text-end font-medium">{t('ops.movQty')}</th>
                    <th className="p-3 text-end font-medium">{t('ops.adjValue')}</th>
                    <th className="p-3 text-start font-medium">{t('ops.adjStatus')}</th>
                    <th className="p-3 text-end font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {adjustments.map((a) => {
                    const value = Math.abs(Number(a.adjustment_qty)) * Number(a.unit_cost);
                    return (
                      <tr key={a.id} className="border-b last:border-0 hover:bg-secondary/30">
                        <td className="p-3 text-muted-foreground whitespace-nowrap">{formatDate(a.created_at)}</td>
                        <td className="p-3">
                          {a.product ? pick(a.product.name, a.product.name_ar) : '—'}
                          {a.reason ? <span className="block text-xs text-muted-foreground">{a.reason}</span> : null}
                        </td>
                        <td className="p-3">{a.warehouse ? pick(a.warehouse.name, a.warehouse.name_ar) : '—'}</td>
                        <td className="p-3 text-end tabular-nums" dir="ltr">
                          <span className={Number(a.adjustment_qty) < 0 ? 'text-destructive' : 'text-success'}>
                            {Number(a.adjustment_qty) > 0 ? '+' : ''}{formatNumber(Number(a.adjustment_qty))}
                          </span>
                        </td>
                        <td className="p-3 text-end tabular-nums" dir="ltr">{formatCurrency(value)}</td>
                        <td className="p-3"><Badge variant={STATUS_VARIANT[a.status]}>{t(STATUS_KEY[a.status])}</Badge></td>
                        <td className="p-3">
                          <div className="flex items-center justify-end gap-1.5">
                            {a.status === 'pending' && (
                              <>
                                <Button size="sm" variant="outline" className="h-8 gap-1" disabled={pending}
                                  onClick={() => runAction(() => approveAdjustment(a.id), 'ops.toastApproved')}>
                                  <CheckCircle2 className="h-3.5 w-3.5" /> {t('ops.adjApprove')}
                                </Button>
                                <Button size="sm" variant="ghost" className="h-8 gap-1 text-destructive" disabled={pending}
                                  onClick={() => confirm({ title: t('ops.adjReject'), destructive: true }).then((ok) => { if (ok) runAction(() => rejectAdjustment(a.id, null), 'ops.toastRejected'); })}>
                                  <XCircle className="h-3.5 w-3.5" /> {t('ops.adjReject')}
                                </Button>
                              </>
                            )}
                            {a.status === 'posted' && (
                              <Button size="sm" variant="ghost" className="h-8 gap-1" disabled={pending}
                                onClick={() => confirm({ title: t('ops.adjReverse') }).then((ok) => { if (ok) runAction(() => reverseAdjustment(a.id), 'ops.toastReversed'); })}>
                                <Undo2 className="h-3.5 w-3.5" /> {t('ops.adjReverse')}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
