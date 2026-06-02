'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { adjustStock } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { STOCK_MOVEMENT_TYPE_LABELS } from '@/lib/erp/constants';
import { formatNumber, formatDate } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/provider';
import type { Branch, ProductCatalog, StockMovementType, Warehouse } from '@/lib/erp/types';
import { Boxes, Search, SlidersHorizontal, Loader2, X, History } from 'lucide-react';
import { toast } from 'sonner';

export interface StockRow {
  warehouse_id: string;
  product_id: string;
  quantity: number;
  reserved_qty: number;
}
export interface MovementRow {
  id: string;
  movement_type: StockMovementType;
  quantity: number;
  notes: string | null;
  created_at: string;
  product: { name: string; name_ar: string | null } | null;
  warehouse: { code: string; name: string; name_ar: string | null } | null;
}

export function InventoryView({
  stock,
  warehouses,
  products,
  movements,
}: {
  stock: StockRow[];
  warehouses: Warehouse[];
  products: ProductCatalog[];
  branches: Branch[];
  movements: MovementRow[];
}) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const [tab, setTab] = useState<'levels' | 'movements'>('levels');
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [query, setQuery] = useState('');
  const [adjust, setAdjust] = useState<{ warehouse_id: string; product_id: string } | null>(null);

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const whById = useMemo(() => new Map(warehouses.map((w) => [w.id, w])), [warehouses]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return stock
      .filter((s) => (warehouseFilter ? s.warehouse_id === warehouseFilter : true))
      .map((s) => {
        const p = productById.get(s.product_id);
        const w = whById.get(s.warehouse_id);
        return {
          ...s,
          productName: p ? p.name_ar || p.name : '—',
          productCode: p?.code ?? '',
          minStock: p ? Number(p.min_stock) : 0,
          whName: w ? `${w.code} · ${w.name_ar || w.name}` : '—',
        };
      })
      .filter((r) =>
        q ? r.productName.toLowerCase().includes(q) || r.productCode.toLowerCase().includes(q) : true,
      )
      .sort((a, b) => a.productName.localeCompare(b.productName));
  }, [stock, warehouseFilter, query, productById, whById]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border p-0.5">
          <button
            onClick={() => setTab('levels')}
            className={`rounded-md px-3 py-1.5 text-sm ${tab === 'levels' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
          >
            {t('inventory.tabLevels')}
          </button>
          <button
            onClick={() => setTab('movements')}
            className={`rounded-md px-3 py-1.5 text-sm ${tab === 'movements' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
          >
            <History className="me-1 inline h-3.5 w-3.5" /> {t('inventory.tabMovements')}
          </button>
        </div>

        {tab === 'levels' && (
          <>
            <select
              value={warehouseFilter}
              onChange={(e) => setWarehouseFilter(e.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">{t('inventory.allWarehouses')}</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.code} · {w.name_ar || w.name}</option>
              ))}
            </select>
            <div className="relative ms-auto">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('inventory.searchProduct')} className="w-56 pe-9" />
            </div>
            <Button
              variant="outline"
              onClick={() => setAdjust({ warehouse_id: warehouseFilter || warehouses[0]?.id || '', product_id: '' })}
              disabled={warehouses.length === 0 || products.length === 0}
            >
              <SlidersHorizontal className="h-4 w-4" /> {t('inventory.adjustStock')}
            </Button>
          </>
        )}
      </div>

      {tab === 'levels' ? (
        rows.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground">
              <Boxes className="h-8 w-8" />
              <p>{t('inventory.emptyLevels')}</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-secondary/50 text-muted-foreground">
                    <tr>
                      <th className="p-3 text-start font-medium">{t('inventory.colProduct')}</th>
                      <th className="p-3 text-start font-medium">{t('inventory.colWarehouse')}</th>
                      <th className="p-3 text-end font-medium">{t('inventory.colAvailable')}</th>
                      <th className="p-3 text-end font-medium">{t('inventory.colReserved')}</th>
                      <th className="p-3 text-center font-medium">{t('inventory.colStatus')}</th>
                      <th className="p-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const low = r.minStock > 0 && Number(r.quantity) < r.minStock;
                      return (
                        <tr key={`${r.warehouse_id}-${r.product_id}`} className="border-b last:border-0 hover:bg-secondary/30">
                          <td className="p-3">
                            <span className="me-2 font-mono text-xs text-muted-foreground" dir="ltr">{r.productCode}</span>
                            {r.productName}
                          </td>
                          <td className="p-3 text-muted-foreground">{r.whName}</td>
                          <td className="p-3 text-left tabular-nums" dir="ltr">{formatNumber(r.quantity)}</td>
                          <td className="p-3 text-left tabular-nums text-muted-foreground" dir="ltr">{formatNumber(r.reserved_qty)}</td>
                          <td className="p-3 text-center">
                            {low ? <Badge variant="warning">{t('inventory.statusBelowMin', { min: formatNumber(r.minStock) })}</Badge> : <Badge variant="success">{t('inventory.statusAvailable')}</Badge>}
                          </td>
                          <td className="p-3 text-start">
                            <Button variant="ghost" size="sm" className="text-xs" onClick={() => setAdjust({ warehouse_id: r.warehouse_id, product_id: r.product_id })}>
                              {t('inventory.adjust')}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )
      ) : movements.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">{t('inventory.emptyMovements')}</CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="p-3 text-start font-medium">{t('inventory.colDate')}</th>
                    <th className="p-3 text-start font-medium">{t('inventory.colType')}</th>
                    <th className="p-3 text-start font-medium">{t('inventory.colProduct')}</th>
                    <th className="p-3 text-start font-medium">{t('inventory.colWarehouse')}</th>
                    <th className="p-3 text-end font-medium">{t('inventory.colQuantity')}</th>
                    <th className="p-3 text-start font-medium">{t('inventory.colNotes')}</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => (
                    <tr key={m.id} className="border-b last:border-0 hover:bg-secondary/30">
                      <td className="p-3 text-muted-foreground">{formatDate(m.created_at)}</td>
                      <td className="p-3">{STOCK_MOVEMENT_TYPE_LABELS[m.movement_type]?.[locale] ?? m.movement_type}</td>
                      <td className="p-3">{m.product?.name_ar || m.product?.name || '—'}</td>
                      <td className="p-3 text-muted-foreground">{m.warehouse ? `${m.warehouse.code}` : '—'}</td>
                      <td className={`p-3 text-left tabular-nums ${Number(m.quantity) < 0 ? 'text-destructive' : 'text-success'}`} dir="ltr">
                        {Number(m.quantity) > 0 ? '+' : ''}{formatNumber(m.quantity)}
                      </td>
                      <td className="p-3 text-muted-foreground">{m.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {adjust && (
        <AdjustDialog
          warehouses={warehouses}
          products={products}
          initial={adjust}
          onClose={() => setAdjust(null)}
          onDone={() => {
            setAdjust(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function AdjustDialog({
  warehouses,
  products,
  initial,
  onClose,
  onDone,
}: {
  warehouses: Warehouse[];
  products: ProductCatalog[];
  initial: { warehouse_id: string; product_id: string };
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [warehouseId, setWarehouseId] = useState(initial.warehouse_id);
  const [productId, setProductId] = useState(initial.product_id);
  const [delta, setDelta] = useState('');
  const [notes, setNotes] = useState('');
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const res = await adjustStock({
        warehouse_id: warehouseId,
        product_id: productId,
        delta: Number(delta),
        notes,
      });
      if (!res.ok) {
        toast.error(res.error ?? t('inventory.toastError'));
        return;
      }
      toast.success(t('inventory.toastAdjustSuccess'));
      onDone();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{t('inventory.adjustDialogTitle')}</h3>
            <button onClick={onClose} className="rounded-md p-1 hover:bg-secondary">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('inventory.adjustWarehouseLabel')}</Label>
            <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.code} · {w.name_ar || w.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('inventory.adjustProductLabel')}</Label>
            <select value={productId} onChange={(e) => setProductId(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="">{t('inventory.adjustProductPlaceholder')}</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.code} · {p.name_ar || p.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('inventory.adjustDeltaLabel')}</Label>
            <Input type="number" step="0.001" dir="ltr" value={delta} onChange={(e) => setDelta(e.target.value)} placeholder={t('inventory.adjustDeltaPlaceholder')} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('inventory.adjustNotesLabel')}</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('inventory.adjustNotesPlaceholder')} />
          </div>
          <div className="flex gap-2">
            <Button onClick={submit} disabled={pending || !productId || !warehouseId}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />} {t('inventory.adjustSubmit')}
            </Button>
            <Button variant="outline" onClick={onClose}>{t('inventory.adjustCancel')}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
