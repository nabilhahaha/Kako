'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { importInstallmentContract, reverseMigratedInstallment } from './actions';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useConfirm } from '@/components/confirm-dialog';
import { useI18n } from '@/lib/i18n/provider';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Loader2, Printer, Undo2, Plus } from 'lucide-react';
import { toast } from 'sonner';

export interface CustomerOption { id: string; code: string; name: string; name_ar: string | null }
export interface BranchOption { id: string; code: string; name: string; name_ar: string | null }
export interface MigratedPlan {
  id: string; reference: string | null; financed_amount: number; installment_count: number;
  status: string; contract_date: string | null; customer: { name: string; name_ar: string | null } | null;
}

export function MigrateForm({
  customers,
  branches,
  plans,
}: {
  customers: CustomerOption[];
  branches: BranchOption[];
  plans: MigratedPlan[];
}) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const confirm = useConfirm();
  const pick = (en: string, ar: string | null) => (locale === 'ar' ? ar || en : en);

  const [customerId, setCustomerId] = useState('');
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [total, setTotal] = useState('');
  const [remaining, setRemaining] = useState('');
  const [count, setCount] = useState('');
  const [frequency, setFrequency] = useState<'weekly' | 'biweekly' | 'monthly'>('monthly');
  const [firstDue, setFirstDue] = useState('');
  const [reference, setReference] = useState('');
  const [contractDate, setContractDate] = useState('');
  const [pending, startTransition] = useTransition();

  function onSubmit() {
    if (!customerId) { toast.error(t('ops.imCustomer')); return; }
    const rem = Number(remaining);
    const cnt = Number(count);
    if (!(rem > 0)) { toast.error(t('ops.imRemaining')); return; }
    if (!(cnt >= 1)) { toast.error(t('ops.imRemainingCount')); return; }
    confirm({ title: t('ops.imSubmit'), message: t('ops.imConfirmMsg'), confirmText: t('ops.imSubmit') }).then((ok) => {
    if (!ok) return;
    startTransition(async () => {
      const res = await importInstallmentContract({
        customerId,
        branchId: branchId || null,
        total: Number(total) || rem,
        remaining: rem,
        remainingCount: cnt,
        frequency,
        firstDue: firstDue || null,
        reference: reference.trim() || null,
        contractDate: contractDate || null,
      });
      if (!res.ok) { toast.error(res.error ?? ''); return; }
      toast.success(t('ops.imToastDone', { count: res.data?.count ?? cnt }));
      setCustomerId(''); setTotal(''); setRemaining(''); setCount(''); setReference(''); setFirstDue(''); setContractDate('');
      router.refresh();
    });
    });
  }

  function onReverse(id: string) {
    confirm({ title: t('ops.obReverse'), destructive: true }).then((ok) => {
      if (!ok) return;
      startTransition(async () => {
        const res = await reverseMigratedInstallment(id);
        if (!res.ok) { toast.error(res.error ?? ''); return; }
        toast.success(t('ops.obToastReversed'));
        router.refresh();
      });
    });
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{t('ops.imCustomer')}</span>
            <select className="h-10 rounded-md border bg-background px-3" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">—</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{pick(c.name, c.name_ar)} ({c.code})</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{t('ops.imBranch')}</span>
            <select className="h-10 rounded-md border bg-background px-3" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              {branches.map((b) => <option key={b.id} value={b.id}>{pick(b.name, b.name_ar)} ({b.code})</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{t('ops.imReference')}</span>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{t('ops.imTotal')}</span>
            <Input type="number" inputMode="decimal" dir="ltr" value={total} onChange={(e) => setTotal(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{t('ops.imRemaining')}</span>
            <Input type="number" inputMode="decimal" dir="ltr" value={remaining} onChange={(e) => setRemaining(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{t('ops.imRemainingCount')}</span>
            <Input type="number" inputMode="numeric" dir="ltr" value={count} onChange={(e) => setCount(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{t('ops.imFrequency')}</span>
            <select className="h-10 rounded-md border bg-background px-3" value={frequency} onChange={(e) => setFrequency(e.target.value as typeof frequency)}>
              <option value="weekly">{t('ops.freqWeekly')}</option>
              <option value="biweekly">{t('ops.freqBiweekly')}</option>
              <option value="monthly">{t('ops.freqMonthly')}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{t('ops.imFirstDue')}</span>
            <Input type="date" dir="ltr" value={firstDue} onChange={(e) => setFirstDue(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{t('ops.imContractDate')}</span>
            <Input type="date" dir="ltr" value={contractDate} onChange={(e) => setContractDate(e.target.value)} />
          </label>
          <div className="flex items-end justify-end sm:col-span-2 lg:col-span-3">
            <Button onClick={onSubmit} disabled={pending} className="gap-1.5">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {t('ops.imSubmit')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {plans.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="p-3 text-start font-medium">{t('ops.imReference')}</th>
                    <th className="p-3 text-start font-medium">{t('ops.imCustomer')}</th>
                    <th className="p-3 text-end font-medium">{t('ops.imRemaining')}</th>
                    <th className="p-3 text-end font-medium">{t('ops.imRemainingCount')}</th>
                    <th className="p-3 text-start font-medium">{t('ops.adjStatus')}</th>
                    <th className="p-3 text-end font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {plans.map((p) => (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-secondary/30">
                      <td className="p-3 font-mono text-xs" dir="ltr">{p.reference || '—'}</td>
                      <td className="p-3">{p.customer ? pick(p.customer.name, p.customer.name_ar) : '—'}</td>
                      <td className="p-3 text-end tabular-nums" dir="ltr">{formatCurrency(p.financed_amount)}</td>
                      <td className="p-3 text-end tabular-nums" dir="ltr">{p.installment_count}</td>
                      <td className="p-3">
                        <Badge variant={p.status === 'cancelled' ? 'destructive' : p.status === 'completed' ? 'success' : 'secondary'}>{p.status}</Badge>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link href={`/print/installment/${p.id}`} target="_blank" className={buttonVariants({ size: 'sm', variant: 'outline' })}>
                            <Printer className="h-3.5 w-3.5" /> {t('ops.imPrint')}
                          </Link>
                          {p.status === 'active' && (
                            <Button size="sm" variant="ghost" className="h-8 gap-1" disabled={pending} onClick={() => onReverse(p.id)}>
                              <Undo2 className="h-3.5 w-3.5" /> {t('ops.obReverse')}
                            </Button>
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
