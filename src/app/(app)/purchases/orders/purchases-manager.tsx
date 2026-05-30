'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ListSearch } from '@/components/list-search';
import { createPurchaseOrder, cancelPurchaseOrder, receivePurchaseOrder } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { LineItemsEditor, newLine, type EditorLine } from '@/components/sales/line-items-editor';
import { PURCHASE_ORDER_STATUS_LABELS } from '@/lib/erp/constants';
import { formatCurrency, formatDate } from '@/lib/utils';
import { INTL_LOCALE } from '@/lib/i18n/config';
import type { Branch, ProductCatalog, PurchaseOrderStatus, Supplier, Warehouse } from '@/lib/erp/types';
import type { PORow } from './page';
import { useConfirm } from '@/components/confirm-dialog';
import { useI18n } from '@/lib/i18n/provider';
import { Plus, Loader2, X, ShoppingCart, PackageCheck } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_VARIANT: Record<PurchaseOrderStatus, 'secondary' | 'success' | 'default' | 'destructive' | 'warning'> = {
  draft: 'secondary',
  sent: 'default',
  partial: 'warning',
  received: 'success',
  cancelled: 'destructive',
};

export function PurchasesManager({
  orders,
  suppliers,
  branches,
  products,
  warehouses,
  q,
}: {
  orders: PORow[];
  suppliers: Supplier[];
  branches: Branch[];
  products: ProductCatalog[];
  warehouses: Warehouse[];
  q: string;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const { t, locale } = useI18n();
  const [creating, setCreating] = useState(false);
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [supplierId, setSupplierId] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<EditorLine[]>([newLine()]);
  const [receiveFor, setReceiveFor] = useState<PORow | null>(null);
  const [pending, startTransition] = useTransition();

  const canCreate = branches.length > 0 && suppliers.length > 0 && products.length > 0;

  function reset() {
    setCreating(false);
    setSupplierId('');
    setNotes('');
    setLines([newLine()]);
  }

  function onCreate() {
    startTransition(async () => {
      const res = await createPurchaseOrder({
        branch_id: branchId,
        supplier_id: supplierId,
        notes,
        lines: lines.map((l) => ({
          product_id: l.product_id,
          quantity: l.quantity,
          unit_price: l.unit_price,
          discount_pct: l.discount_pct,
          tax_rate: l.tax_rate,
        })),
      });
      if (!res.ok) {
        toast.error(res.error ?? t('purchases.errGeneric'));
        return;
      }
      toast.success(t('purchases.toastCreated'));
      reset();
      router.refresh();
    });
  }

  async function onCancel(id: string) {
    const ok = await confirm({
      title: t('purchases.confirmCancelTitle'),
      confirmText: t('purchases.confirmCancelBtn'),
      cancelText: t('purchases.confirmCancelBack'),
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await cancelPurchaseOrder(id);
      if (!res.ok) {
        toast.error(res.error ?? t('purchases.errGeneric'));
        return;
      }
      toast.success(t('purchases.toastCancelled'));
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {!creating && (
        <Button onClick={() => setCreating(true)} disabled={!canCreate}>
          <Plus className="h-4 w-4" /> {t('purchases.btnNewOrder')}
        </Button>
      )}
      {!canCreate && !creating && (
        <p className="text-sm text-warning">
          {t('purchases.warnNeedData')}
        </p>
      )}

      {creating && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{t('purchases.formNewOrderTitle')}</h3>
              <button onClick={reset} className="rounded-md p-1 hover:bg-secondary">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {branches.length > 1 && (
                <div className="space-y-1">
                  <Label className="text-xs">{t('purchases.labelBranch')}</Label>
                  <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name_ar || b.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs">{t('purchases.labelSupplier')}</Label>
                <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">{t('purchases.placeholderChooseSupplier')}</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name_ar || s.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t('purchases.labelNotes')}</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>

            <LineItemsEditor products={products} lines={lines} onChange={setLines} priceField="cost" />

            <div className="flex gap-2">
              <Button onClick={onCreate} disabled={pending}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" />} {t('purchases.btnSaveOrder')}
              </Button>
              <Button variant="outline" onClick={reset}>{t('purchases.btnCancel')}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {orders.length === 0 && !q ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground">
            <ShoppingCart className="h-8 w-8" />
            <p>{t('purchases.emptyOrders')}</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="flex flex-wrap items-center gap-2 border-b p-3">
              <ListSearch placeholder={t('purchases.searchPlaceholder')} className="w-64" />
            </div>
            {orders.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">{t('purchases.noResults')}</p>
            ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="p-3 text-right font-medium">{t('purchases.colOrderNumber')}</th>
                    <th className="p-3 text-right font-medium">{t('purchases.colSupplier')}</th>
                    <th className="p-3 text-right font-medium">{t('purchases.colDate')}</th>
                    <th className="p-3 text-left font-medium">{t('purchases.colNet')}</th>
                    <th className="p-3 text-center font-medium">{t('purchases.colStatus')}</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} className="border-b last:border-0 hover:bg-secondary/30">
                      <td className="p-3 font-mono text-xs" dir="ltr">{o.po_number}</td>
                      <td className="p-3 font-medium">{o.supplier?.name_ar || o.supplier?.name || '—'}</td>
                      <td className="p-3 text-muted-foreground">{formatDate(o.created_at, INTL_LOCALE[locale])}</td>
                      <td className="p-3 text-left tabular-nums" dir="ltr">{formatCurrency(o.net_amount, 'EGP', INTL_LOCALE[locale])}</td>
                      <td className="p-3 text-center">
                        <Badge variant={STATUS_VARIANT[o.status]}>{PURCHASE_ORDER_STATUS_LABELS[o.status][locale]}</Badge>
                      </td>
                      <td className="p-3">
                        <div className="flex justify-end gap-1">
                          {(o.status === 'draft' || o.status === 'sent' || o.status === 'partial') && (
                            <>
                              <Button variant="ghost" size="sm" disabled={pending} onClick={() => setReceiveFor(o)} className="text-xs">
                                <PackageCheck className="h-3.5 w-3.5" /> {t('purchases.btnReceive')}
                              </Button>
                              <Button variant="ghost" size="sm" disabled={pending} onClick={() => onCancel(o.id)} className="text-xs text-destructive">
                                {t('purchases.btnCancel')}
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

      {receiveFor && (
        <ReceiveDialog
          po={receiveFor}
          products={products}
          warehouses={warehouses.filter((w) => w.branch_id === receiveFor.branch_id)}
          onClose={() => setReceiveFor(null)}
          onDone={() => {
            setReceiveFor(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function ReceiveDialog({
  po,
  products,
  warehouses,
  onClose,
  onDone,
}: {
  po: PORow;
  products: ProductCatalog[];
  warehouses: Warehouse[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? '');
  const [details, setDetails] = useState<Record<string, { batch_number: string; expiry_date: string }>>({});
  const [pending, startTransition] = useTransition();

  const productName = (id: string) => {
    const p = products.find((x) => x.id === id);
    return p ? `${p.code} · ${p.name_ar || p.name}` : id;
  };
  function setDetail(productId: string, patch: Partial<{ batch_number: string; expiry_date: string }>) {
    setDetails((prev) => {
      const current = prev[productId] ?? { batch_number: '', expiry_date: '' };
      return { ...prev, [productId]: { ...current, ...patch } };
    });
  }

  function submit() {
    startTransition(async () => {
      const res = await receivePurchaseOrder(
        po.id,
        warehouseId,
        po.lines.map((l) => ({
          product_id: l.product_id,
          batch_number: details[l.product_id]?.batch_number,
          expiry_date: details[l.product_id]?.expiry_date,
        })),
      );
      if (!res.ok) {
        toast.error(res.error ?? t('purchases.errGeneric'));
        return;
      }
      toast.success(t('purchases.toastReceived'));
      onDone();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <Card className="max-h-[90vh] w-full max-w-lg overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{t('purchases.receiveDialogTitle', { number: po.po_number })}</h3>
            <button onClick={onClose} className="rounded-md p-1 hover:bg-secondary">
              <X className="h-4 w-4" />
            </button>
          </div>
          {warehouses.length === 0 ? (
            <p className="text-sm text-warning">{t('purchases.warnNoWarehouse')}</p>
          ) : (
            <>
              <div className="space-y-1">
                <Label className="text-xs">{t('purchases.labelReceivingWarehouse')}</Label>
                <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>{w.code} · {w.name_ar || w.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">{t('purchases.labelBatchDetails')}</Label>
                {po.lines.map((l) => (
                  <div key={l.product_id} className="rounded-md border p-2">
                    <p className="mb-1 text-sm font-medium">{productName(l.product_id)} <span className="text-xs text-muted-foreground" dir="ltr">×{l.quantity}</span></p>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        placeholder={t('purchases.placeholderBatchNumber')}
                        value={details[l.product_id]?.batch_number ?? ''}
                        onChange={(e) => setDetail(l.product_id, { batch_number: e.target.value })}
                        className="h-9"
                      />
                      <Input
                        type="date" dir="ltr" title={t('purchases.titleExpiryDate')}
                        value={details[l.product_id]?.expiry_date ?? ''}
                        onChange={(e) => setDetail(l.product_id, { expiry_date: e.target.value })}
                        className="h-9"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          <div className="flex gap-2">
            <Button onClick={submit} disabled={pending || warehouses.length === 0}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />} {t('purchases.btnConfirmReceive')}
            </Button>
            <Button variant="outline" onClick={onClose}>{t('purchases.btnCancel')}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
