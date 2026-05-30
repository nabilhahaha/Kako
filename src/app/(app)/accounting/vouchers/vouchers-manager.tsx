'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ListSearch } from '@/components/list-search';
import { createVoucher, postVoucher, cancelVoucher, type VoucherKind } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { VOUCHER_STATUS_LABELS } from '@/lib/erp/constants';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Branch, ChartOfAccount, VoucherStatus } from '@/lib/erp/types';
import { useConfirm } from '@/components/confirm-dialog';
import { Plus, Loader2, X, CheckCircle2, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n/provider';

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
  kind,
  rows,
  q,
  accounts,
  branches,
}: {
  kind: VoucherKind;
  rows: VoucherRow[];
  q: string;
  accounts: ChartOfAccount[];
  branches: Branch[];
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <div className="flex w-fit rounded-lg border p-0.5">
        <Link
          href="/accounting/vouchers?kind=payment"
          className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-sm ${kind === 'payment' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
        >
          <ArrowUpCircle className="h-4 w-4" /> {t('accounting.vouchers.tabPayment')}
        </Link>
        <Link
          href="/accounting/vouchers?kind=receipt"
          className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-sm ${kind === 'receipt' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
        >
          <ArrowDownCircle className="h-4 w-4" /> {t('accounting.vouchers.tabReceipt')}
        </Link>
      </div>

      <VoucherSection key={kind} kind={kind} rows={rows} q={q} accounts={accounts} branches={branches} />
    </div>
  );
}

function VoucherSection({
  kind,
  rows,
  q,
  accounts,
  branches,
}: {
  kind: VoucherKind;
  rows: VoucherRow[];
  q: string;
  accounts: ChartOfAccount[];
  branches: Branch[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const { t, locale } = useI18n();
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
  const partyLabel = isPayment ? t('accounting.vouchers.fieldPayee') : t('accounting.vouchers.fieldPayer');

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
        toast.error(res.error ?? t('accounting.vouchers.toastError'));
        return;
      }
      toast.success(t('accounting.vouchers.toastCreated'));
      reset();
      router.refresh();
    });
  }

  async function onPost(id: string) {
    const ok = await confirm({
      title: t('accounting.vouchers.confirmPostTitle'),
      message: t('accounting.vouchers.confirmPostMessage'),
      confirmText: t('accounting.vouchers.confirmPostBtn'),
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await postVoucher(kind, id);
      if (!res.ok) {
        toast.error(res.error ?? t('accounting.vouchers.toastError'));
        return;
      }
      toast.success(t('accounting.vouchers.toastPosted'));
      router.refresh();
    });
  }

  async function onCancel(id: string) {
    const ok = await confirm({
      title: t('accounting.vouchers.confirmCancelTitle'),
      confirmText: t('accounting.vouchers.confirmCancelBtn'),
      cancelText: t('accounting.vouchers.confirmCancelBack'),
      destructive: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await cancelVoucher(kind, id);
      if (!res.ok) {
        toast.error(res.error ?? t('accounting.vouchers.toastError'));
        return;
      }
      toast.success(t('accounting.vouchers.toastCancelled'));
      router.refresh();
    });
  }

  const canCreate = branches.length > 0 && accounts.length > 0;

  return (
    <div className="space-y-4">
      {!creating && (
        <Button onClick={() => setCreating(true)} disabled={!canCreate}>
          <Plus className="h-4 w-4" /> {isPayment ? t('accounting.vouchers.newPayment') : t('accounting.vouchers.newReceipt')}
        </Button>
      )}

      {creating && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{isPayment ? t('accounting.vouchers.formTitlePayment') : t('accounting.vouchers.formTitleReceipt')}</h3>
              <button onClick={reset} className="rounded-md p-1 hover:bg-secondary"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {branches.length > 1 && (
                <Field label={t('accounting.vouchers.fieldBranch')}>
                  <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={selectCls}>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name_ar || b.name}</option>)}
                  </select>
                </Field>
              )}
              <Field label={partyLabel}>
                <Input value={party} onChange={(e) => setParty(e.target.value)} />
              </Field>
              <Field label={t('accounting.vouchers.fieldAmount')}>
                <Input type="number" step="0.01" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Field>
              <Field label={isPayment ? t('accounting.vouchers.fieldExpenseAccount') : t('accounting.vouchers.fieldRevenueAccount')}>
                <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={selectCls}>
                  <option value="">{t('accounting.vouchers.selectAccountPlaceholder')}</option>
                  {preferred.length > 0 && (
                    <optgroup label={isPayment ? t('accounting.vouchers.optgroupExpenses') : t('accounting.vouchers.optgroupRevenue')}>
                      {preferred.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name_ar || a.name}</option>)}
                    </optgroup>
                  )}
                  <optgroup label={t('accounting.vouchers.optgroupOther')}>
                    {others.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name_ar || a.name}</option>)}
                  </optgroup>
                </select>
              </Field>
              <Field label={t('accounting.vouchers.fieldDate')}>
                <Input type="date" dir="ltr" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label={t('accounting.vouchers.fieldNotes')}>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
            </div>
            <p className="text-xs text-muted-foreground">
              {isPayment ? t('accounting.vouchers.postingHintPayment') : t('accounting.vouchers.postingHintReceipt')}
            </p>
            <div className="flex gap-2">
              <Button onClick={onCreate} disabled={pending}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" />} {t('accounting.vouchers.save')}
              </Button>
              <Button variant="outline" onClick={reset}>{t('accounting.vouchers.cancel')}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {rows.length === 0 && !q ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {isPayment ? t('accounting.vouchers.emptyPayment') : t('accounting.vouchers.emptyReceipt')}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="flex flex-wrap items-center gap-2 border-b p-3">
              <ListSearch placeholder={t('accounting.vouchers.searchPlaceholder')} className="w-64" />
            </div>
            {rows.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">{t('accounting.vouchers.noResults')}</p>
            ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="p-3 text-right font-medium">{t('accounting.vouchers.colNumber')}</th>
                    <th className="p-3 text-right font-medium">{isPayment ? t('accounting.vouchers.colPayee') : t('accounting.vouchers.colPayer')}</th>
                    <th className="p-3 text-right font-medium">{t('accounting.vouchers.colAccount')}</th>
                    <th className="p-3 text-right font-medium">{t('accounting.vouchers.colDate')}</th>
                    <th className="p-3 text-left font-medium">{t('accounting.vouchers.colAmount')}</th>
                    <th className="p-3 text-center font-medium">{t('accounting.vouchers.colStatus')}</th>
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
                        <Badge variant={STATUS_VARIANT[v.status]}>{VOUCHER_STATUS_LABELS[v.status][locale]}</Badge>
                      </td>
                      <td className="p-3">
                        <div className="flex justify-end gap-1">
                          {(v.status === 'draft' || v.status === 'approved') && (
                            <>
                              <Button variant="ghost" size="sm" disabled={pending} onClick={() => onPost(v.id)} className="text-xs">
                                <CheckCircle2 className="h-3.5 w-3.5" /> {t('accounting.vouchers.actionPost')}
                              </Button>
                              <Button variant="ghost" size="sm" disabled={pending} onClick={() => onCancel(v.id)} className="text-xs text-destructive">
                                {t('accounting.vouchers.actionCancel')}
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

const selectCls = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
