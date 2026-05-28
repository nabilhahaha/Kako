'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createVoucher, postVoucher, cancelVoucher, type VoucherKind } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { VOUCHER_STATUS_LABELS } from '@/lib/erp/constants';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Branch, ChartOfAccount, VoucherStatus } from '@/lib/erp/types';
import { Plus, Loader2, X, CheckCircle2, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { toast } from 'sonner';

export interface VoucherRow {
  id: string;
  voucher_number: string;
  voucher_date: string;
  party: string;
  amount: number;
  status: VoucherStatus;
  account: { code: string; name: string; name_ar: string | null } | null;
}

const STATUS_VARIANT: Record<VoucherStatus, 'secondary' | 'success' | 'default' | 'destructive'> = {
  draft: 'secondary',
  approved: 'default',
  posted: 'success',
  cancelled: 'destructive',
};

export function VouchersManager({
  paymentVouchers,
  receiptVouchers,
  accounts,
  branches,
}: {
  paymentVouchers: VoucherRow[];
  receiptVouchers: VoucherRow[];
  accounts: ChartOfAccount[];
  branches: Branch[];
}) {
  const [kind, setKind] = useState<VoucherKind>('payment');
  const rows = kind === 'payment' ? paymentVouchers : receiptVouchers;

  return (
    <div className="space-y-4">
      <div className="flex w-fit rounded-lg border p-0.5">
        <button
          onClick={() => setKind('payment')}
          className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-sm ${kind === 'payment' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
        >
          <ArrowUpCircle className="h-4 w-4" /> سندات صرف
        </button>
        <button
          onClick={() => setKind('receipt')}
          className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-sm ${kind === 'receipt' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
        >
          <ArrowDownCircle className="h-4 w-4" /> سندات قبض
        </button>
      </div>

      <VoucherSection key={kind} kind={kind} rows={rows} accounts={accounts} branches={branches} />
    </div>
  );
}

function VoucherSection({
  kind,
  rows,
  accounts,
  branches,
}: {
  kind: VoucherKind;
  rows: VoucherRow[];
  accounts: ChartOfAccount[];
  branches: Branch[];
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [accountId, setAccountId] = useState('');
  const [party, setParty] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [pending, startTransition] = useTransition();

  // Sensible default account filter: expenses for payment, revenue for receipt.
  const preferred = accounts.filter((a) =>
    kind === 'payment' ? a.account_type === 'expense' : a.account_type === 'revenue',
  );
  const others = accounts.filter((a) =>
    kind === 'payment' ? a.account_type !== 'expense' : a.account_type !== 'revenue',
  );

  const isPayment = kind === 'payment';
  const partyLabel = isPayment ? 'المستفيد (المدفوع له)' : 'الدافع (المقبوض منه)';

  function reset() {
    setCreating(false);
    setAccountId('');
    setParty('');
    setAmount('');
    setNotes('');
  }

  function onCreate() {
    startTransition(async () => {
      const res = await createVoucher(kind, {
        branch_id: branchId,
        account_id: accountId,
        party,
        amount: Number(amount),
        voucher_date: date,
        notes,
      });
      if (!res.ok) {
        toast.error(res.error ?? 'حدث خطأ');
        return;
      }
      toast.success('تم إنشاء السند (مسودة)');
      reset();
      router.refresh();
    });
  }

  function onPost(id: string) {
    startTransition(async () => {
      const res = await postVoucher(kind, id);
      if (!res.ok) {
        toast.error(res.error ?? 'حدث خطأ');
        return;
      }
      toast.success('تم ترحيل السند والقيد');
      router.refresh();
    });
  }

  function onCancel(id: string) {
    startTransition(async () => {
      const res = await cancelVoucher(kind, id);
      if (!res.ok) {
        toast.error(res.error ?? 'حدث خطأ');
        return;
      }
      toast.success('تم إلغاء السند');
      router.refresh();
    });
  }

  const canCreate = branches.length > 0 && accounts.length > 0;

  return (
    <div className="space-y-4">
      {!creating && (
        <Button onClick={() => setCreating(true)} disabled={!canCreate}>
          <Plus className="h-4 w-4" /> {isPayment ? 'سند صرف جديد' : 'سند قبض جديد'}
        </Button>
      )}

      {creating && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{isPayment ? 'سند صرف جديد' : 'سند قبض جديد'}</h3>
              <button onClick={reset} className="rounded-md p-1 hover:bg-secondary"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {branches.length > 1 && (
                <Field label="الفرع *">
                  <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={selectCls}>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name_ar || b.name}</option>)}
                  </select>
                </Field>
              )}
              <Field label={partyLabel + ' *'}>
                <Input value={party} onChange={(e) => setParty(e.target.value)} />
              </Field>
              <Field label="المبلغ *">
                <Input type="number" step="0.01" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Field>
              <Field label={isPayment ? 'حساب المصروف *' : 'حساب الإيراد *'}>
                <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={selectCls}>
                  <option value="">اختر حساباً…</option>
                  {preferred.length > 0 && (
                    <optgroup label={isPayment ? 'المصروفات' : 'الإيرادات'}>
                      {preferred.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name_ar || a.name}</option>)}
                    </optgroup>
                  )}
                  <optgroup label="حسابات أخرى">
                    {others.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name_ar || a.name}</option>)}
                  </optgroup>
                </select>
              </Field>
              <Field label="التاريخ">
                <Input type="date" dir="ltr" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label="ملاحظات">
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
            </div>
            <p className="text-xs text-muted-foreground">
              عند الترحيل: {isPayment ? 'مدين الحساب المختار / دائن النقدية' : 'مدين النقدية / دائن الحساب المختار'}.
            </p>
            <div className="flex gap-2">
              <Button onClick={onCreate} disabled={pending}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" />} حفظ
              </Button>
              <Button variant="outline" onClick={reset}>إلغاء</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {rows.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            لا توجد {isPayment ? 'سندات صرف' : 'سندات قبض'} بعد.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="p-3 text-right font-medium">الرقم</th>
                    <th className="p-3 text-right font-medium">{isPayment ? 'المستفيد' : 'الدافع'}</th>
                    <th className="p-3 text-right font-medium">الحساب</th>
                    <th className="p-3 text-right font-medium">التاريخ</th>
                    <th className="p-3 text-left font-medium">المبلغ</th>
                    <th className="p-3 text-center font-medium">الحالة</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((v) => (
                    <tr key={v.id} className="border-b last:border-0 hover:bg-secondary/30">
                      <td className="p-3 font-mono text-xs" dir="ltr">{v.voucher_number}</td>
                      <td className="p-3 font-medium">{v.party}</td>
                      <td className="p-3 text-muted-foreground">{v.account ? `${v.account.code} · ${v.account.name_ar || v.account.name}` : '—'}</td>
                      <td className="p-3 text-muted-foreground">{formatDate(v.voucher_date)}</td>
                      <td className="p-3 text-left tabular-nums" dir="ltr">{formatCurrency(v.amount)}</td>
                      <td className="p-3 text-center">
                        <Badge variant={STATUS_VARIANT[v.status]}>{VOUCHER_STATUS_LABELS[v.status].ar}</Badge>
                      </td>
                      <td className="p-3">
                        <div className="flex justify-end gap-1">
                          {(v.status === 'draft' || v.status === 'approved') && (
                            <>
                              <Button variant="ghost" size="sm" disabled={pending} onClick={() => onPost(v.id)} className="text-xs">
                                <CheckCircle2 className="h-3.5 w-3.5" /> ترحيل
                              </Button>
                              <Button variant="ghost" size="sm" disabled={pending} onClick={() => onCancel(v.id)} className="text-xs text-destructive">
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
