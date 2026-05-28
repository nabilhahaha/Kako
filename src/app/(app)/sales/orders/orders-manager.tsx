'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createSalesOrder, cancelSalesOrder, convertOrderToInvoice } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { LineItemsEditor, newLine, type EditorLine } from '@/components/sales/line-items-editor';
import { SALES_ORDER_STATUS_LABELS } from '@/lib/erp/constants';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Branch, ErpCustomer, ProductCatalog, SalesOrderStatus } from '@/lib/erp/types';
import type { OrderRow } from './page';
import { useConfirm } from '@/components/confirm-dialog';
import { Plus, Loader2, X, FileText, FileUp } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_VARIANT: Record<SalesOrderStatus, 'secondary' | 'success' | 'default' | 'destructive'> = {
  draft: 'secondary',
  confirmed: 'default',
  invoiced: 'success',
  cancelled: 'destructive',
};

export function OrdersManager({
  orders,
  customers,
  branches,
  products,
}: {
  orders: OrderRow[];
  customers: ErpCustomer[];
  branches: Branch[];
  products: ProductCatalog[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [creating, setCreating] = useState(false);
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [customerId, setCustomerId] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<EditorLine[]>([newLine()]);
  const [pending, startTransition] = useTransition();

  const canCreate = branches.length > 0 && customers.length > 0 && products.length > 0;

  function reset() {
    setCreating(false);
    setCustomerId('');
    setNotes('');
    setLines([newLine()]);
  }

  function onCreate() {
    startTransition(async () => {
      const res = await createSalesOrder({
        branch_id: branchId,
        customer_id: customerId,
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
      toast.success('تم إنشاء أمر البيع');
      reset();
      router.refresh();
    });
  }

  function onConvert(id: string) {
    startTransition(async () => {
      const res = await convertOrderToInvoice(id);
      if (!res.ok) {
        toast.error(res.error ?? 'حدث خطأ');
        return;
      }
      toast.success('تم تحويل الأمر إلى فاتورة (مسودة)');
      router.refresh();
    });
  }

  async function onCancel(id: string) {
    const ok = await confirm({
      title: 'إلغاء أمر البيع؟',
      confirmText: 'إلغاء الأمر',
      cancelText: 'تراجع',
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await cancelSalesOrder(id);
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
          <Plus className="h-4 w-4" /> أمر بيع جديد
        </Button>
      )}
      {!canCreate && !creating && (
        <p className="text-sm text-warning">
          تحتاج فرعاً وعميلاً ومنتجاً واحداً على الأقل قبل إنشاء أمر بيع.
        </p>
      )}

      {creating && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">أمر بيع جديد</h3>
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
                <Label className="text-xs">العميل *</Label>
                <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">اختر عميلاً…</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name_ar || c.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">ملاحظات</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>

            <LineItemsEditor products={products} lines={lines} onChange={setLines} />

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
            <FileText className="h-8 w-8" />
            <p>لا توجد أوامر بيع بعد.</p>
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
                    <th className="p-3 text-right font-medium">العميل</th>
                    <th className="p-3 text-right font-medium">التاريخ</th>
                    <th className="p-3 text-left font-medium">الصافي</th>
                    <th className="p-3 text-center font-medium">الحالة</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} className="border-b last:border-0 hover:bg-secondary/30">
                      <td className="p-3 font-mono text-xs" dir="ltr">{o.order_number}</td>
                      <td className="p-3 font-medium">{o.customer?.name_ar || o.customer?.name || '—'}</td>
                      <td className="p-3 text-muted-foreground">{formatDate(o.created_at)}</td>
                      <td className="p-3 text-left tabular-nums" dir="ltr">{formatCurrency(o.net_amount)}</td>
                      <td className="p-3 text-center">
                        <Badge variant={STATUS_VARIANT[o.status]}>{SALES_ORDER_STATUS_LABELS[o.status].ar}</Badge>
                      </td>
                      <td className="p-3">
                        <div className="flex justify-end gap-1">
                          {(o.status === 'draft' || o.status === 'confirmed') && (
                            <>
                              <Button variant="ghost" size="sm" disabled={pending} onClick={() => onConvert(o.id)} className="text-xs">
                                <FileUp className="h-3.5 w-3.5" /> فاتورة
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
    </div>
  );
}
