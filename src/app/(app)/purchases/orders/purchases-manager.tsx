'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createPurchaseOrder, cancelPurchaseOrder, receivePurchaseOrder } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { LineItemsEditor, newLine, type EditorLine } from '@/components/sales/line-items-editor';
import { PURCHASE_ORDER_STATUS_LABELS } from '@/lib/erp/constants';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Branch, ProductCatalog, PurchaseOrderStatus, Supplier, Warehouse } from '@/lib/erp/types';
import type { PORow } from './page';
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
}: {
  orders: PORow[];
  suppliers: Supplier[];
  branches: Branch[];
  products: ProductCatalog[];
  warehouses: Warehouse[];
}) {
  const router = useRouter();
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
        toast.error(res.error ?? 'حدث خطأ');
        return;
      }
      toast.success('تم إنشاء أمر الشراء');
      reset();
      router.refresh();
    });
  }

  function onCancel(id: string) {
    startTransition(async () => {
      const res = await cancelPurchaseOrder(id);
      if (!res.ok) {
        toast.error(res.error ?? 'حدث خطأ');
        return;
      }
      toast.success('تم إلغاء الأمر');
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {!creating && (
        <Button onClick={() => setCreating(true)} disabled={!canCreate}>
          <Plus className="h-4 w-4" /> أمر شراء جديد
        </Button>
      )}
      {!canCreate && !creating && (
        <p className="text-sm text-warning">
          تحتاج فرعاً ومورداً ومنتجاً واحداً على الأقل قبل إنشاء أمر شراء.
        </p>
      )}

      {creating && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">أمر شراء جديد</h3>
              <button onClick={reset} className="rounded-md p-1 hover:bg-secondary">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {branches.length > 1 && (
                <div className="space-y-1">
                  <Label className="text-xs">الفرع *</Label>
                  <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name_ar || b.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs">المورد *</Label>
                <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">اختر مورداً…</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name_ar || s.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">ملاحظات</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>

            <LineItemsEditor products={products} lines={lines} onChange={setLines} priceField="cost" />

            <div className="flex gap-2">
              <Button onClick={onCreate} disabled={pending}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" />} حفظ الأمر
              </Button>
              <Button variant="outline" onClick={reset}>إلغاء</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {orders.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground">
            <ShoppingCart className="h-8 w-8" />
            <p>لا توجد أوامر شراء بعد.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="p-3 text-right font-medium">رقم الأمر</th>
                    <th className="p-3 text-right font-medium">المورد</th>
                    <th className="p-3 text-right font-medium">التاريخ</th>
                    <th className="p-3 text-left font-medium">الصافي</th>
                    <th className="p-3 text-center font-medium">الحالة</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} className="border-b last:border-0 hover:bg-secondary/30">
                      <td className="p-3 font-mono text-xs" dir="ltr">{o.po_number}</td>
                      <td className="p-3 font-medium">{o.supplier?.name_ar || o.supplier?.name || '—'}</td>
                      <td className="p-3 text-muted-foreground">{formatDate(o.created_at)}</td>
                      <td className="p-3 text-left tabular-nums" dir="ltr">{formatCurrency(o.net_amount)}</td>
                      <td className="p-3 text-center">
                        <Badge variant={STATUS_VARIANT[o.status]}>{PURCHASE_ORDER_STATUS_LABELS[o.status].ar}</Badge>
                      </td>
                      <td className="p-3">
                        <div className="flex justify-end gap-1">
                          {(o.status === 'draft' || o.status === 'sent' || o.status === 'partial') && (
                            <>
                              <Button variant="ghost" size="sm" disabled={pending} onClick={() => setReceiveFor(o)} className="text-xs">
                                <PackageCheck className="h-3.5 w-3.5" /> استلام
                              </Button>
                              <Button variant="ghost" size="sm" disabled={pending} onClick={() => onCancel(o.id)} className="text-xs text-destructive">
                                إلغاء
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
          </CardContent>
        </Card>
      )}

      {receiveFor && (
        <ReceiveDialog
          po={receiveFor}
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
  warehouses,
  onClose,
  onDone,
}: {
  po: PORow;
  warehouses: Warehouse[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? '');
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const res = await receivePurchaseOrder(po.id, warehouseId);
      if (!res.ok) {
        toast.error(res.error ?? 'حدث خطأ');
        return;
      }
      toast.success('تم الاستلام وزيادة المخزون وترحيل قيد المخزون/الموردين');
      onDone();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">استلام أمر الشراء {po.po_number}</h3>
            <button onClick={onClose} className="rounded-md p-1 hover:bg-secondary">
              <X className="h-4 w-4" />
            </button>
          </div>
          {warehouses.length === 0 ? (
            <p className="text-sm text-warning">لا يوجد مخزن لهذا الفرع. أنشئ مخزناً أولاً.</p>
          ) : (
            <div className="space-y-1">
              <Label className="text-xs">المخزن المستلِم *</Label>
              <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.code} · {w.name_ar || w.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex gap-2">
            <Button onClick={submit} disabled={pending || warehouses.length === 0}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />} تأكيد الاستلام الكامل
            </Button>
            <Button variant="outline" onClick={onClose}>إلغاء</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
