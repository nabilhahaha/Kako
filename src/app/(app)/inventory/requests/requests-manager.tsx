'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createStockRequest, approveStockRequest, rejectStockRequest, cancelStockRequest } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useConfirm } from '@/components/confirm-dialog';
import { formatDate, formatNumber } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/provider';
import type { Branch, ProductCatalog, Warehouse } from '@/lib/erp/types';
import { Plus, Loader2, X, Trash2, ClipboardCheck, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

type ReqStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export interface RequestRow {
  id: string;
  request_number: string;
  branch_id: string;
  from_warehouse_id: string;
  to_warehouse_id: string;
  status: ReqStatus;
  requested_by: string | null;
  created_at: string;
  from_warehouse: { code: string; name: string; name_ar: string | null } | null;
  to_warehouse: { code: string; name: string; name_ar: string | null } | null;
  lines: Array<{ product_id: string; quantity: number }>;
}

const STATUS_VARIANT: Record<ReqStatus, 'secondary' | 'success' | 'destructive' | 'warning'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'destructive',
  cancelled: 'secondary',
};

const STATUS_KEY: Record<ReqStatus, string> = {
  pending: 'inventory.requestStatusPending',
  approved: 'inventory.requestStatusApproved',
  rejected: 'inventory.requestStatusRejected',
  cancelled: 'inventory.requestStatusCancelled',
};

interface Line {
  key: string;
  product_id: string;
  quantity: number;
}
const newLine = (): Line => ({ key: Math.random().toString(36).slice(2), product_id: '', quantity: 1 });

export function RequestsManager({
  requests,
  warehouses,
  branches,
  products,
  canApprove,
  canRequest,
}: {
  requests: RequestRow[];
  warehouses: Warehouse[];
  branches: Branch[];
  products: ProductCatalog[];
  currentUserId: string;
  canApprove: boolean;
  canRequest: boolean;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const confirm = useConfirm();
  const vans = warehouses.filter((w) => w.is_van);
  const sources = warehouses.filter((w) => !w.is_van);

  const [creating, setCreating] = useState(false);
  const [fromWh, setFromWh] = useState(sources[0]?.id ?? '');
  const [toVan, setToVan] = useState(vans[0]?.id ?? '');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [pending, startTransition] = useTransition();

  const whName = (w: { code: string; name: string; name_ar: string | null } | null) =>
    w ? `${w.code} · ${w.name_ar || w.name}` : '—';
  const productName = (id: string) => {
    const p = products.find((x) => x.id === id);
    return p ? p.name_ar || p.name : id;
  };

  function reset() {
    setCreating(false);
    setNotes('');
    setLines([newLine()]);
  }

  function onCreate() {
    const wh = warehouses.find((w) => w.id === toVan);
    startTransition(async () => {
      const res = await createStockRequest({
        branch_id: wh?.branch_id ?? branches[0]?.id ?? '',
        from_warehouse_id: fromWh,
        to_warehouse_id: toVan,
        notes,
        lines: lines.map((l) => ({ product_id: l.product_id, quantity: l.quantity })),
      });
      if (!res.ok) {
        toast.error(res.error ?? t('inventory.toastError'));
        return;
      }
      toast.success(t('inventory.toastRequestSent'));
      reset();
      router.refresh();
    });
  }

  function onApprove(id: string) {
    confirm({ title: t('inventory.confirmApproveTitle'), message: t('inventory.confirmApproveMessage'), confirmText: t('inventory.confirmApproveBtn') }).then((ok) => {
      if (!ok) return;
      startTransition(async () => {
        const res = await approveStockRequest(id);
        if (!res.ok) toast.error(res.error ?? t('inventory.toastError'));
        else { toast.success(t('inventory.toastRequestApproved')); router.refresh(); }
      });
    });
  }
  function onReject(id: string) {
    startTransition(async () => {
      const res = await rejectStockRequest(id);
      if (!res.ok) toast.error(res.error ?? t('inventory.toastError'));
      else router.refresh();
    });
  }
  function onCancel(id: string) {
    startTransition(async () => {
      const res = await cancelStockRequest(id);
      if (!res.ok) toast.error(res.error ?? t('inventory.toastError'));
      else router.refresh();
    });
  }

  const canCreate = canRequest && sources.length > 0 && vans.length > 0 && products.length > 0;

  return (
    <div className="space-y-4">
      {canRequest && !creating && (
        <Button onClick={() => setCreating(true)} disabled={!canCreate}>
          <Plus className="h-4 w-4" /> {t('inventory.newRequest')}
        </Button>
      )}
      {canRequest && !canCreate && !creating && (
        <p className="text-sm text-warning">{t('inventory.requestNeedWarning')}</p>
      )}

      {creating && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{t('inventory.requestFormTitle')}</h3>
              <button onClick={reset} className="rounded-md p-1 hover:bg-secondary"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs">{t('inventory.fromWarehouseLabel')}</Label>
                <select value={fromWh} onChange={(e) => setFromWh(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  {sources.map((w) => <option key={w.id} value={w.id}>{w.code} · {w.name_ar || w.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t('inventory.toVanLabel')}</Label>
                <select value={toVan} onChange={(e) => setToVan(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  {vans.map((w) => <option key={w.id} value={w.id}>{w.code} · {w.name_ar || w.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t('inventory.notesLabel')}</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="border-b bg-secondary/50 text-muted-foreground">
                  <tr><th className="p-2 text-start font-medium">{t('inventory.colProductItem')}</th><th className="p-2 text-center font-medium w-28">{t('inventory.colQty')}</th><th className="p-2 w-10"></th></tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.key} className="border-b last:border-0">
                      <td className="p-2">
                        <select value={l.product_id} onChange={(e) => setLines(lines.map((x) => x.key === l.key ? { ...x, product_id: e.target.value } : x))} className="h-9 w-full min-w-[10rem] rounded-md border border-input bg-background px-2 text-sm">
                          <option value="">{t('inventory.selectProductPlaceholder')}</option>
                          {products.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name_ar || p.name}</option>)}
                        </select>
                      </td>
                      <td className="p-2">
                        <Input type="number" step="0.001" min="0" dir="ltr" value={l.quantity} onChange={(e) => setLines(lines.map((x) => x.key === l.key ? { ...x, quantity: Number(e.target.value) } : x))} className="h-9 text-center" />
                      </td>
                      <td className="p-2">
                        <button type="button" onClick={() => setLines(lines.filter((x) => x.key !== l.key))} className="rounded-md p-1.5 text-destructive hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setLines([...lines, newLine()])}><Plus className="h-4 w-4" /> {t('inventory.addItem')}</Button>
            <div className="flex gap-2">
              <Button onClick={onCreate} disabled={pending}>{pending && <Loader2 className="h-4 w-4 animate-spin" />} {t('inventory.submitRequest')}</Button>
              <Button variant="outline" onClick={reset}>{t('inventory.cancelBtn')}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {requests.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground">
            <ClipboardCheck className="h-8 w-8" />
            <p>{t('inventory.emptyRequests')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {requests.map((r) => (
            <Card key={r.id}>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <span className="font-mono text-xs text-muted-foreground" dir="ltr">{r.request_number}</span>
                    <p className="text-sm">
                      {t('inventory.requestDirectionLabel', { from: whName(r.from_warehouse), to: whName(r.to_warehouse) })}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {r.lines.map((l) => `${productName(l.product_id)} ×${formatNumber(l.quantity)}`).join(' · ')}
                    </p>
                    <p className="text-xs text-muted-foreground">{formatDate(r.created_at)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge variant={STATUS_VARIANT[r.status]}>{t(STATUS_KEY[r.status])}</Badge>
                    {r.status === 'pending' && (
                      <div className="flex gap-1">
                        {canApprove && (
                          <Button size="sm" disabled={pending} onClick={() => onApprove(r.id)} className="text-xs">
                            <CheckCircle2 className="h-3.5 w-3.5" /> {t('inventory.approveLoad')}
                          </Button>
                        )}
                        {canApprove && (
                          <Button size="sm" variant="ghost" disabled={pending} onClick={() => onReject(r.id)} className="text-xs text-destructive">{t('inventory.rejectRequest')}</Button>
                        )}
                        <Button size="sm" variant="ghost" disabled={pending} onClick={() => onCancel(r.id)} className="text-xs">{t('inventory.cancelRequest')}</Button>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
