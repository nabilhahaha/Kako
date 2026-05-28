'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createInvoice, issueInvoice, recordPayment, cancelInvoice } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { LineItemsEditor, newLine, type EditorLine } from '@/components/sales/line-items-editor';
import { INVOICE_STATUS_LABELS, PAYMENT_METHOD_OPTIONS } from '@/lib/erp/constants';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Branch, ErpCustomer, InvoiceStatus, PaymentMethod, ProductCatalog } from '@/lib/erp/types';
import type { InvoiceRow } from './page';
import { useConfirm } from '@/components/confirm-dialog';
import Link from 'next/link';
import { Plus, Loader2, X, Receipt, CheckCircle2, Wallet, Printer } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_VARIANT: Record<InvoiceStatus, 'secondary' | 'success' | 'default' | 'destructive' | 'warning'> = {
  draft: 'secondary',
  issued: 'default',
  paid: 'success',
  partially_paid: 'warning',
  cancelled: 'destructive',
  overdue: 'warning',
};

export function InvoicesManager({
  invoices,
  customers,
  branches,
  products,
}: {
  invoices: InvoiceRow[];
  customers: ErpCustomer[];
  branches: Branch[];
  products: ProductCatalog[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [creating, setCreating] = useState(false);
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [customerId, setCustomerId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<EditorLine[]>([newLine()]);
  const [payFor, setPayFor] = useState<InvoiceRow | null>(null);
  const [pending, startTransition] = useTransition();

  const canCreate = branches.length > 0 && customers.length > 0 && products.length > 0;

  function reset() {
    setCreating(false);
    setCustomerId('');
    setDueDate('');
    setNotes('');
    setLines([newLine()]);
  }

  function onCreate() {
    startTransition(async () => {
      const res = await createInvoice({
        branch_id: branchId,
        customer_id: customerId,
        due_date: dueDate,
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
      toast.success('تم إنشاء الفاتورة (مسودة)');
      reset();
      router.refresh();
    });
  }

  async function onIssue(id: string) {
    const ok = await confirm({
      title: 'إصدار الفاتورة؟',
      message: 'سيتم خصم الكميات من المخزون وترحيل القيد المحاسبي. لا يمكن التراجع.',
      confirmText: 'إصدار',
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await issueInvoice(id);
      if (!res.ok) {
        toast.error(res.error ?? 'حدث خطأ');
        return;
      }
      toast.success('تم إصدار الفاتورة وترحيل القيد وخصم المخزون');
      router.refresh();
    });
  }

  async function onCancel(id: string) {
    const ok = await confirm({
      title: 'إلغاء الفاتورة؟',
      message: 'سيتم تعليم الفاتورة كملغية.',
      confirmText: 'إلغاء الفاتورة',
      cancelText: 'تراجع',
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await cancelInvoice(id);
      if (!res.ok) {
        toast.error(res.error ?? 'حدث خطأ');
        return;
      }
      toast.success('تم إلغاء الفاتورة');
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {!creating && (
        <Button onClick={() => setCreating(true)} disabled={!canCreate}>
          <Plus className="h-4 w-4" /> فاتورة جديدة
        </Button>
      )}
      {!canCreate && !creating && (
        <p className="text-sm text-warning">
          تحتاج فرعاً وعميلاً ومنتجاً واحداً على الأقل قبل إنشاء فاتورة.
        </p>
      )}

      {creating && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">فاتورة جديدة</h3>
              <button onClick={reset} className="rounded-md p-1 hover:bg-secondary">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
                <Label className="text-xs">تاريخ الاستحقاق</Label>
                <Input type="date" dir="ltr" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">ملاحظات</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>

            <LineItemsEditor products={products} lines={lines} onChange={setLines} />

            <div className="flex gap-2">
              <Button onClick={onCreate} disabled={pending}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" />} حفظ كمسودة
              </Button>
              <Button variant="outline" onClick={reset}>إلغاء</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {invoices.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground">
            <Receipt className="h-8 w-8" />
            <p>لا توجد فواتير بعد.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="p-3 text-right font-medium">رقم الفاتورة</th>
                    <th className="p-3 text-right font-medium">العميل</th>
                    <th className="p-3 text-right font-medium">التاريخ</th>
                    <th className="p-3 text-left font-medium">الصافي</th>
                    <th className="p-3 text-left font-medium">المدفوع</th>
                    <th className="p-3 text-left font-medium">المتبقي</th>
                    <th className="p-3 text-center font-medium">الحالة</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => {
                    const remaining = Number(inv.net_amount) - Number(inv.paid_amount);
                    const canPay = ['issued', 'partially_paid', 'overdue'].includes(inv.status) && remaining > 0.001;
                    return (
                      <tr key={inv.id} className="border-b last:border-0 hover:bg-secondary/30">
                        <td className="p-3 font-mono text-xs" dir="ltr">{inv.invoice_number}</td>
                        <td className="p-3 font-medium">{inv.customer?.name_ar || inv.customer?.name || '—'}</td>
                        <td className="p-3 text-muted-foreground">{formatDate(inv.created_at)}</td>
                        <td className="p-3 text-left tabular-nums" dir="ltr">{formatCurrency(inv.net_amount)}</td>
                        <td className="p-3 text-left tabular-nums text-success" dir="ltr">{formatCurrency(inv.paid_amount)}</td>
                        <td className="p-3 text-left tabular-nums" dir="ltr">{formatCurrency(remaining)}</td>
                        <td className="p-3 text-center">
                          <Badge variant={STATUS_VARIANT[inv.status]}>{INVOICE_STATUS_LABELS[inv.status].ar}</Badge>
                        </td>
                        <td className="p-3">
                          <div className="flex justify-end gap-1">
                            <Link href={`/print/invoices/${inv.id}`} target="_blank" className="rounded-md p-1.5 hover:bg-secondary" aria-label="طباعة" title="طباعة">
                              <Printer className="h-4 w-4" />
                            </Link>
                            {inv.status === 'draft' && (
                              <>
                                <Button variant="ghost" size="sm" disabled={pending} onClick={() => onIssue(inv.id)} className="text-xs">
                                  <CheckCircle2 className="h-3.5 w-3.5" /> إصدار
                                </Button>
                                <Button variant="ghost" size="sm" disabled={pending} onClick={() => onCancel(inv.id)} className="text-xs text-destructive">
                                  إلغاء
                                </Button>
                              </>
                            )}
                            {canPay && (
                              <Button variant="ghost" size="sm" onClick={() => setPayFor(inv)} className="text-xs">
                                <Wallet className="h-3.5 w-3.5" /> تحصيل
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

      {payFor && (
        <PaymentDialog
          invoice={payFor}
          onClose={() => setPayFor(null)}
          onDone={() => {
            setPayFor(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function PaymentDialog({
  invoice,
  onClose,
  onDone,
}: {
  invoice: InvoiceRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const remaining = Number(invoice.net_amount) - Number(invoice.paid_amount);
  const [amount, setAmount] = useState(remaining.toFixed(2));
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [ref, setRef] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const res = await recordPayment({
        invoice_id: invoice.id,
        amount: Number(amount),
        payment_method: method,
        reference_number: ref,
        payment_date: date,
      });
      if (!res.ok) {
        toast.error(res.error ?? 'حدث خطأ');
        return;
      }
      toast.success('تم تسجيل التحصيل وترحيل القيد');
      onDone();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <Card className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">تحصيل فاتورة {invoice.invoice_number}</h3>
            <button onClick={onClose} className="rounded-md p-1 hover:bg-secondary">
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="text-sm text-muted-foreground">
            المتبقي: <span dir="ltr" className="font-semibold tabular-nums">{formatCurrency(remaining)}</span>
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">المبلغ *</Label>
              <Input type="number" step="0.01" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">طريقة الدفع</Label>
              <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                {PAYMENT_METHOD_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>{m.ar}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">رقم المرجع</Label>
              <Input dir="ltr" value={ref} onChange={(e) => setRef(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">التاريخ</Label>
              <Input type="date" dir="ltr" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={submit} disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />} تأكيد التحصيل
            </Button>
            <Button variant="outline" onClick={onClose}>إلغاء</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
