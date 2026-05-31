'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ListSearch } from '@/components/list-search';
import { createTransfer, completeTransfer, cancelTransfer } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { TRANSFER_STATUS_LABELS } from '@/lib/erp/constants';
import { formatDate, formatNumber } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/provider';
import type { Branch, ProductCatalog, TransferStatus, Warehouse } from '@/lib/erp/types';
import type { TransferRow } from './page';
import { useConfirm } from '@/components/confirm-dialog';
import { Plus, Loader2, X, ArrowLeftRight, CheckCircle2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_VARIANT: Record<TransferStatus, 'secondary' | 'success' | 'default' | 'destructive'> = {
  draft: 'secondary',
  in_transit: 'default',
  received: 'success',
  cancelled: 'destructive',
};

interface Line {
  key: string;
  product_id: string;
  quantity: number;
}
function newLine(): Line {
  return { key: Math.random().toString(36).slice(2), product_id: '', quantity: 1 };
}

export function TransfersManager({
  transfers,
  warehouses,
  products,
  branches,
  q,
}: {
  transfers: TransferRow[];
  warehouses: Warehouse[];
  products: ProductCatalog[];
  branches: Branch[];
  q: string;
}) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const confirm = useConfirm();
  const [creating, setCreating] = useState(false);
  const [fromWh, setFromWh] = useState('');
  const [toWh, setToWh] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [pending, startTransition] = useTransition();

  const canCreate = warehouses.length >= 2 && products.length > 0 && branches.length > 0;

  function reset() {
    setCreating(false);
    setFromWh('');
    setToWh('');
    setNotes('');
    setLines([newLine()]);
  }

  function branchOfWarehouse(whId: string) {
    return warehouses.find((w) => w.id === whId)?.branch_id ?? branches[0]?.id ?? '';
  }

  function onCreate() {
    startTransition(async () => {
      const res = await createTransfer({
        branch_id: branchOfWarehouse(fromWh),
        from_warehouse_id: fromWh,
        to_warehouse_id: toWh,
        notes,
        lines: lines.map((l) => ({ product_id: l.product_id, quantity: l.quantity })),
      });
      if (!res.ok) {
        toast.error(res.error ?? t('inventory.toastError'));
        return;
      }
      toast.success(t('inventory.toastTransferCreated'));
      reset();
      router.refresh();
    });
  }

  async function onComplete(id: string) {
    const ok = await confirm({
      title: t('inventory.confirmCompleteTitle'),
      message: t('inventory.confirmCompleteMessage'),
      confirmText: t('inventory.confirmCompleteBtn'),
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await completeTransfer(id);
      if (!res.ok) {
        toast.error(res.error ?? t('inventory.toastError'));
        return;
      }
      toast.success(t('inventory.toastTransferCompleted'));
      router.refresh();
    });
  }

  async function onCancel(id: string) {
    const ok = await confirm({
      title: t('inventory.confirmCancelTransferTitle'),
      confirmText: t('inventory.confirmCancelTransferBtn'),
      cancelText: t('inventory.confirmCancelTransferBack'),
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await cancelTransfer(id);
      if (!res.ok) {
        toast.error(res.error ?? t('inventory.toastError'));
        return;
      }
      toast.success(t('inventory.toastTransferCancelled'));
      router.refresh();
    });
  }

  const whLabel = (w: { code: string; name: string; name_ar: string | null } | null) =>
    w ? `${w.code} · ${w.name_ar || w.name}` : '—';

  return (
    <div className="space-y-4">
      {!creating && (
        <Button onClick={() => setCreating(true)} disabled={!canCreate}>
          <Plus className="h-4 w-4" /> {t('inventory.newTransfer')}
        </Button>
      )}
      {!canCreate && !creating && (
        <p className="text-sm text-warning">{t('inventory.transferNeedMinWarnings')}</p>
      )}

      {creating && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{t('inventory.transferFormTitle')}</h3>
              <button onClick={reset} className="rounded-md p-1 hover:bg-secondary"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs">{t('inventory.fromWarehouse')}</Label>
                <select value={fromWh} onChange={(e) => setFromWh(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">{t('inventory.selectPlaceholder')}</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>{w.code} · {w.name_ar || w.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t('inventory.toWarehouse')}</Label>
                <select value={toWh} onChange={(e) => setToWh(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">{t('inventory.selectPlaceholder')}</option>
                  {warehouses.filter((w) => w.id !== fromWh).map((w) => (
                    <option key={w.id} value={w.id}>{w.code} · {w.name_ar || w.name}</option>
                  ))}
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
                  <tr>
                    <th className="p-2 text-start font-medium">{t('inventory.colProductItem')}</th>
                    <th className="p-2 text-center font-medium w-28">{t('inventory.colQty')}</th>
                    <th className="p-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.key} className="border-b last:border-0">
                      <td className="p-2">
                        <select
                          value={l.product_id}
                          onChange={(e) => setLines(lines.map((x) => x.key === l.key ? { ...x, product_id: e.target.value } : x))}
                          className="h-9 w-full min-w-[10rem] rounded-md border border-input bg-background px-2 text-sm"
                        >
                          <option value="">{t('inventory.selectProductPlaceholder')}</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>{p.code} · {p.name_ar || p.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2">
                        <Input type="number" step="0.001" min="0" dir="ltr"
                          value={l.quantity}
                          onChange={(e) => setLines(lines.map((x) => x.key === l.key ? { ...x, quantity: Number(e.target.value) } : x))}
                          className="h-9 text-center" />
                      </td>
                      <td className="p-2">
                        <button type="button" onClick={() => setLines(lines.filter((x) => x.key !== l.key))} className="rounded-md p-1.5 text-destructive hover:bg-destructive/10">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setLines([...lines, newLine()])}>
              <Plus className="h-4 w-4" /> {t('inventory.addLine')}
            </Button>

            <div className="flex gap-2">
              <Button onClick={onCreate} disabled={pending}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" />} {t('inventory.saveDraft')}
              </Button>
              <Button variant="outline" onClick={reset}>{t('inventory.cancelBtn')}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {transfers.length === 0 && !q ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground">
            <ArrowLeftRight className="h-8 w-8" />
            <p>{t('inventory.emptyTransfers')}</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="flex flex-wrap items-center gap-2 border-b p-3">
              <ListSearch placeholder={t('inventory.searchTransfer')} className="w-64" />
            </div>
            {transfers.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">{t('inventory.noResults')}</p>
            ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="p-3 text-start font-medium">{t('inventory.colTransferNo')}</th>
                    <th className="p-3 text-start font-medium">{t('inventory.colFrom')}</th>
                    <th className="p-3 text-start font-medium">{t('inventory.colTo')}</th>
                    <th className="p-3 text-start font-medium">{t('inventory.colDate')}</th>
                    <th className="p-3 text-center font-medium">{t('inventory.colStatusTh')}</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {transfers.map((tr) => (
                    <tr key={tr.id} className="border-b last:border-0 hover:bg-secondary/30">
                      <td className="p-3 font-mono text-xs" dir="ltr">{tr.transfer_number}</td>
                      <td className="p-3">{whLabel(tr.from_warehouse)}</td>
                      <td className="p-3">{whLabel(tr.to_warehouse)}</td>
                      <td className="p-3 text-muted-foreground">{formatDate(tr.created_at)}</td>
                      <td className="p-3 text-center">
                        <Badge variant={STATUS_VARIANT[tr.status]}>{TRANSFER_STATUS_LABELS[tr.status][locale]}</Badge>
                      </td>
                      <td className="p-3">
                        <div className="flex justify-end gap-1">
                          {(tr.status === 'draft' || tr.status === 'in_transit') && (
                            <>
                              <Button variant="ghost" size="sm" disabled={pending} onClick={() => onComplete(tr.id)} className="text-xs">
                                <CheckCircle2 className="h-3.5 w-3.5" /> {t('inventory.completeTransfer')}
                              </Button>
                              <Button variant="ghost" size="sm" disabled={pending} onClick={() => onCancel(tr.id)} className="text-xs text-destructive">
                                {t('inventory.cancelTransfer')}
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
