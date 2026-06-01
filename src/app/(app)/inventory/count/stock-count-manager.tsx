'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createStockCount, saveStockCount, finalizeStockCount, cancelStockCount } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useConfirm } from '@/components/confirm-dialog';
import { formatNumber, formatDate } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/provider';
import type { Warehouse } from '@/lib/erp/types';
import { Plus, Loader2, ClipboardList, ArrowLeft, Save, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

export interface CountRow {
  id: string;
  count_number: string;
  status: 'draft' | 'completed' | 'cancelled';
  created_at: string;
  completed_at: string | null;
  warehouse: { code: string; name: string; name_ar: string | null } | null;
}
export interface CountLineRow {
  id: string;
  product_id: string;
  system_qty: number;
  counted_qty: number;
  product: { code: string; name: string; name_ar: string | null } | null;
}

const STATUS_VARIANT: Record<CountRow['status'], 'secondary' | 'success' | 'destructive'> = {
  draft: 'secondary',
  completed: 'success',
  cancelled: 'destructive',
};

const STATUS_KEY: Record<CountRow['status'], string> = {
  draft: 'inventory.countStatusDraft',
  completed: 'inventory.countStatusCompleted',
  cancelled: 'inventory.countStatusCancelled',
};

export function StockCountManager({
  warehouses,
  counts,
  activeCount,
  activeLines,
}: {
  warehouses: Warehouse[];
  counts: CountRow[];
  activeCount: CountRow | null;
  activeLines: CountLineRow[];
}) {
  const router = useRouter();
  const { t } = useI18n();
  const confirm = useConfirm();
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? '');
  const [pending, startTransition] = useTransition();

  function onCreate() {
    if (!warehouseId) return;
    startTransition(async () => {
      const res = await createStockCount(warehouseId);
      if (!res.ok || !res.data) {
        toast.error(res.error ?? t('inventory.toastError'));
        return;
      }
      toast.success(t('inventory.toastCountCreated'));
      router.push(`/inventory/count?id=${res.data.id}`);
    });
  }

  // Detail view (editing a specific count).
  if (activeCount) {
    return (
      <CountEditor
        count={activeCount}
        lines={activeLines}
        confirm={confirm}
        onBack={() => router.push('/inventory/count')}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">{t('inventory.warehouseOrVanLabel')}</label>
          <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>{w.code} · {w.name_ar || w.name}</option>
            ))}
          </select>
        </div>
        <Button onClick={onCreate} disabled={pending || warehouses.length === 0}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} {t('inventory.startNewCount')}
        </Button>
      </div>

      {counts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground">
            <ClipboardList className="h-8 w-8" />
            <p>{t('inventory.emptyCount')}</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="p-3 text-start font-medium">{t('inventory.colCountNo')}</th>
                    <th className="p-3 text-start font-medium">{t('inventory.colWarehouse')}</th>
                    <th className="p-3 text-start font-medium">{t('inventory.colCountDate')}</th>
                    <th className="p-3 text-center font-medium">{t('inventory.colCountStatus')}</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {counts.map((c) => (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-secondary/30">
                      <td className="p-3 font-mono text-xs" dir="ltr">{c.count_number}</td>
                      <td className="p-3">{c.warehouse?.code} · {c.warehouse?.name_ar || c.warehouse?.name}</td>
                      <td className="p-3 text-muted-foreground">{formatDate(c.created_at)}</td>
                      <td className="p-3 text-center"><Badge variant={STATUS_VARIANT[c.status]}>{t(STATUS_KEY[c.status])}</Badge></td>
                      <td className="p-3 text-start">
                        <Link href={`/inventory/count?id=${c.id}`} className="text-xs text-primary hover:underline">
                          {c.status === 'draft' ? t('inventory.continueCount') : t('inventory.viewCount')}
                        </Link>
                      </td>
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

function CountEditor({
  count,
  lines,
  confirm,
  onBack,
}: {
  count: CountRow;
  lines: CountLineRow[];
  confirm: ReturnType<typeof useConfirm>;
  onBack: () => void;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const [counted, setCounted] = useState<Record<string, number>>(
    Object.fromEntries(lines.map((l) => [l.id, Number(l.counted_qty)])),
  );
  const [query, setQuery] = useState('');
  const [pending, startTransition] = useTransition();
  const readOnly = count.status !== 'draft';

  const payload = lines.map((l) => ({ id: l.id, counted_qty: counted[l.id] ?? 0 }));
  const variances = lines.map((l) => ({
    ...l,
    diff: (counted[l.id] ?? 0) - Number(l.system_qty),
  }));
  const shortage = variances.filter((v) => v.diff < 0).reduce((s, v) => s + v.diff, 0);
  const surplus = variances.filter((v) => v.diff > 0).reduce((s, v) => s + v.diff, 0);

  const filtered = variances.filter((v) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const n = (v.product?.name_ar || v.product?.name || '').toLowerCase();
    return n.includes(q) || (v.product?.code || '').toLowerCase().includes(q);
  });

  function save() {
    startTransition(async () => {
      const res = await saveStockCount(count.id, payload);
      if (!res.ok) toast.error(res.error ?? t('inventory.toastError'));
      else toast.success(t('inventory.toastCountSaved'));
    });
  }
  function finalize() {
    confirm({
      title: t('inventory.confirmFinalizeTitle'),
      message: t('inventory.confirmFinalizeMessage'),
      confirmText: t('inventory.confirmFinalizeBtn'),
    }).then((ok) => {
      if (!ok) return;
      startTransition(async () => {
        const res = await finalizeStockCount(count.id, payload);
        if (!res.ok) {
          toast.error(res.error ?? t('inventory.toastError'));
          return;
        }
        toast.success(t('inventory.toastCountFinalized'));
        router.push('/inventory/count');
      });
    });
  }
  function cancel() {
    confirm({ title: t('inventory.confirmCancelCountTitle'), confirmText: t('inventory.confirmCancelCountBtn'), cancelText: t('inventory.confirmCancelCountBack'), destructive: true }).then((ok) => {
      if (!ok) return;
      startTransition(async () => {
        const res = await cancelStockCount(count.id);
        if (!res.ok) toast.error(res.error ?? t('inventory.toastError'));
        else router.push('/inventory/count');
      });
    });
  }

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {t('inventory.backToAllCounts')}
      </button>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-mono text-xs text-muted-foreground" dir="ltr">{count.count_number}</span>
          <p className="font-semibold">{count.warehouse?.name_ar || count.warehouse?.name}</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Badge variant={STATUS_VARIANT[count.status]}>{t(STATUS_KEY[count.status])}</Badge>
          <Badge variant="destructive">{t('inventory.shortageLabel', { n: formatNumber(shortage) })}</Badge>
          <Badge variant="success">{t('inventory.surplusLabel', { n: formatNumber(surplus) })}</Badge>
        </div>
      </div>

      <div className="relative max-w-xs">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('inventory.searchCountProduct')} className="h-9" />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-secondary/50 text-muted-foreground">
                <tr>
                  <th className="p-3 text-start font-medium">{t('inventory.colProduct')}</th>
                  <th className="p-3 text-center font-medium">{t('inventory.colBookQty')}</th>
                  <th className="p-3 text-center font-medium">{t('inventory.colActualQty')}</th>
                  <th className="p-3 text-center font-medium">{t('inventory.colDiff')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((v) => (
                  <tr key={v.id} className="border-b last:border-0">
                    <td className="p-2 ps-3">
                      <span className="me-2 font-mono text-xs text-muted-foreground" dir="ltr">{v.product?.code}</span>
                      {v.product?.name_ar || v.product?.name}
                    </td>
                    <td className="p-2 text-center tabular-nums" dir="ltr">{formatNumber(v.system_qty)}</td>
                    <td className="p-2 text-center">
                      <Input
                        type="number" step="0.001" dir="ltr" disabled={readOnly}
                        value={counted[v.id] ?? 0}
                        onChange={(e) => setCounted((prev) => ({ ...prev, [v.id]: Number(e.target.value) }))}
                        className="mx-auto h-8 w-24 text-center"
                      />
                    </td>
                    <td className={`p-2 text-center tabular-nums ${v.diff < 0 ? 'text-destructive' : v.diff > 0 ? 'text-success' : 'text-muted-foreground'}`} dir="ltr">
                      {v.diff > 0 ? '+' : ''}{formatNumber(v.diff)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={save} variant="outline" disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {t('inventory.saveTempBtn')}
          </Button>
          <Button onClick={finalize} disabled={pending}>
            <CheckCircle2 className="h-4 w-4" /> {t('inventory.finalizeCountBtn')}
          </Button>
          <Button onClick={cancel} variant="ghost" className="text-destructive" disabled={pending}>{t('inventory.cancelCountBtn')}</Button>
        </div>
      )}
    </div>
  );
}
