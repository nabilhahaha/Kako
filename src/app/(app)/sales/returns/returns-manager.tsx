'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createReturn, completeReturn, cancelReturn } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { RETURN_STATUS_LABELS } from '@/lib/erp/constants';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Branch, ErpCustomer, ProductCatalog, ReturnStatus } from '@/lib/erp/types';
import type { ReturnRow } from './page';
import { useConfirm } from '@/components/confirm-dialog';
import { Plus, Loader2, X, Undo2, CheckCircle2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_VARIANT: Record<ReturnStatus, 'secondary' | 'success' | 'default' | 'destructive'> = {
  draft: 'secondary',
  approved: 'default',
  completed: 'success',
  cancelled: 'destructive',
};

interface Line {
  key: string;
  product: ProductCatalog | null;
  quantity: number;
  unit_price: number;
}
function newLine(): Line {
  return { key: Math.random().toString(36).slice(2), product: null, quantity: 1, unit_price: 0 };
}

export function ReturnsManager({
  returns,
  customers,
  branches,
  products,
}: {
  returns: ReturnRow[];
  customers: ErpCustomer[];
  branches: Branch[];
  products: ProductCatalog[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [creating, setCreating] = useState(false);
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [customerId, setCustomerId] = useState('');
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [pending, startTransition] = useTransition();

  const canCreate = branches.length > 0 && customers.length > 0 && products.length > 0;

  function reset() {
    setCreating(false);
    setCustomerId('');
    setReason('');
    setLines([newLine()]);
  }

  function pickProduct(key: string, productId: string) {
    const p = products.find((x) => x.id === productId) ?? null;
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, product: p, unit_price: p ? Number(p.sell_price) : 0 } : l)));
  }

  const total = lines.reduce((s, l) => s + (l.product ? l.quantity * l.unit_price : 0), 0);

  function onCreate() {
    startTransition(async () => {
      const res = await createReturn({
        branch_id: branchId,
        customer_id: customerId,
        reason,
        lines: lines.filter((l) => l.product).map((l) => ({ product_id: l.product!.id, quantity: l.quantity, unit_price: l.unit_price })),
      });
      if (!res.ok) {
        toast.error(res.error ?? 'حدث خطأ');
        return;
      }
      toast.success('تم إنشاء المرتجع (مسودة)');
      reset();
      router.refresh();
    });
  }

  async function onComplete(id: string) {
    const ok = await confirm({
      title: 'اعتماد المرتجع؟',
      message: 'سيتم إرجاع البضاعة للمخزون وتسوية حساب العميل وترحيل القيد. لا يمكن التراجع.',
      confirmText: 'اعتماد',
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await completeReturn(id);
      if (!res.ok) {
        toast.error(res.error ?? 'حدث خطأ');
        return;
      }
      toast.success('تم اعتماد المرتجع وإرجاع البضاعة وتسوية الحساب');
      router.refresh();
    });
  }

  async function onCancel(id: string) {
    const ok = await confirm({
      title: 'إلغاء المرتجع؟',
      confirmText: 'إلغاء',
      cancelText: 'تراجع',
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await cancelReturn(id);
      if (!res.ok) {
        toast.error(res.error ?? 'حدث خطأ');
        return;
      }
      toast.success('تم إلغاء المرتجع');
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {!creating && (
        <Button onClick={() => setCreating(true)} disabled={!canCreate}>
          <Plus className="h-4 w-4" /> مرتجع جديد
        </Button>
      )}
      {!canCreate && !creating && (
        <p className="text-sm text-warning">تحتاج فرعاً وعميلاً ومنتجاً واحداً على الأقل.</p>
      )}

      {creating && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">مرتجع مبيعات جديد</h3>
              <button onClick={reset} className="rounded-md p-1 hover:bg-secondary"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {branches.length > 1 && (
                <div className="space-y-1">
                  <Label className="text-xs">الفرع *</Label>
                  <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={selectCls}>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name_ar || b.name}</option>)}
                  </select>
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs">العميل *</Label>
                <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={selectCls}>
                  <option value="">اختر عميلاً…</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name_ar || c.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">سبب الإرجاع</Label>
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="تالف، قرب انتهاء صلاحية…" />
              </div>
            </div>

            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="border-b bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="p-2 text-right font-medium">المنتج</th>
                    <th className="p-2 text-center font-medium w-24">الكمية</th>
                    <th className="p-2 text-center font-medium w-28">سعر الوحدة</th>
                    <th className="p-2 text-left font-medium w-28">الإجمالي</th>
                    <th className="p-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.key} className="border-b last:border-0">
                      <td className="p-2">
                        <select value={l.product?.id ?? ''} onChange={(e) => pickProduct(l.key, e.target.value)} className="h-9 w-full min-w-[10rem] rounded-md border border-input bg-background px-2 text-sm">
                          <option value="">اختر منتجاً…</option>
                          {products.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name_ar || p.name}</option>)}
                        </select>
                      </td>
                      <td className="p-2">
                        <Input type="number" step="0.001" min="0" dir="ltr" value={l.quantity}
                          onChange={(e) => setLines(lines.map((x) => x.key === l.key ? { ...x, quantity: Number(e.target.value) } : x))} className="h-9 text-center" />
                      </td>
                      <td className="p-2">
                        <Input type="number" step="0.01" min="0" dir="ltr" value={l.unit_price}
                          onChange={(e) => setLines(lines.map((x) => x.key === l.key ? { ...x, unit_price: Number(e.target.value) } : x))} className="h-9 text-center" />
                      </td>
                      <td className="p-2 text-left tabular-nums" dir="ltr">{formatCurrency(l.quantity * l.unit_price)}</td>
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
            <div className="flex items-center justify-between">
              <Button type="button" variant="outline" size="sm" onClick={() => setLines([...lines, newLine()])}>
                <Plus className="h-4 w-4" /> إضافة بند
              </Button>
              <div className="text-sm font-bold">
                الإجمالي: <span dir="ltr" className="tabular-nums">{formatCurrency(total)}</span>
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={onCreate} disabled={pending}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" />} حفظ
              </Button>
              <Button variant="outline" onClick={reset}>إلغاء</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {returns.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground">
            <Undo2 className="h-8 w-8" />
            <p>لا توجد مرتجعات بعد.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="p-3 text-right font-medium">رقم المرتجع</th>
                    <th className="p-3 text-right font-medium">العميل</th>
                    <th className="p-3 text-right font-medium">السبب</th>
                    <th className="p-3 text-right font-medium">التاريخ</th>
                    <th className="p-3 text-left font-medium">القيمة</th>
                    <th className="p-3 text-center font-medium">الحالة</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {returns.map((r) => (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-secondary/30">
                      <td className="p-3 font-mono text-xs" dir="ltr">{r.return_number}</td>
                      <td className="p-3 font-medium">{r.customer?.name_ar || r.customer?.name || '—'}</td>
                      <td className="p-3 text-muted-foreground">{r.reason || '—'}</td>
                      <td className="p-3 text-muted-foreground">{formatDate(r.created_at)}</td>
                      <td className="p-3 text-left tabular-nums" dir="ltr">{formatCurrency(r.total_amount)}</td>
                      <td className="p-3 text-center">
                        <Badge variant={STATUS_VARIANT[r.status]}>{RETURN_STATUS_LABELS[r.status].ar}</Badge>
                      </td>
                      <td className="p-3">
                        <div className="flex justify-end gap-1">
                          {(r.status === 'draft' || r.status === 'approved') && (
                            <>
                              <Button variant="ghost" size="sm" disabled={pending} onClick={() => onComplete(r.id)} className="text-xs">
                                <CheckCircle2 className="h-3.5 w-3.5" /> اعتماد
                              </Button>
                              <Button variant="ghost" size="sm" disabled={pending} onClick={() => onCancel(r.id)} className="text-xs text-destructive">
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

const selectCls = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm';
