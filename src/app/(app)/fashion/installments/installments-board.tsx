'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n/provider';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils';
import { INTL_LOCALE } from '@/lib/i18n/config';
import type { Locale } from '@/lib/i18n/config';
import { planProgress, isOverdue } from '@/lib/fashion/installments';
import { collectInstallmentFlex, setInstallmentAmounts } from '../actions';
import { Loader2, SlidersHorizontal } from 'lucide-react';

interface Sched { id: string; seq_no: number; due_date: string; amount: number; paid_amount: number; status: string }
interface Plan {
  id: string; total_amount: number; down_payment: number; financed_amount: number; status: string;
  customer: { name: string } | null; schedule: Sched[];
}

export function InstallmentsBoard({ plans, locale, today }: { plans: Plan[]; locale: Locale; today: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<string | null>(plans[0]?.id ?? null);
  const [amt, setAmt] = useState<Record<string, string>>({});
  const [editPlan, setEditPlan] = useState<Plan | null>(null);
  const [editAmts, setEditAmts] = useState<string[]>([]);
  const money = (n: number) => formatCurrency(n, 'EGP', INTL_LOCALE[locale]);

  function collect(s: Sched) {
    const remaining = Math.max(s.amount - s.paid_amount, 0);
    const raw = amt[s.id];
    const value = raw !== undefined && raw !== '' ? Number(raw) : remaining;
    if (!(value > 0)) { toast.error(t('fashion.installments.errAmount')); return; }
    start(async () => {
      const res = await collectInstallmentFlex(s.id, value, 'cash');
      if (!res.ok) { toast.error(res.error || 'Error'); return; }
      toast.success(res.data && res.data.advance > 0
        ? t('fashion.installments.collectedAdvance', { amount: money(res.data.advance) })
        : t('fashion.installments.collected'));
      setAmt((m) => ({ ...m, [s.id]: '' }));
      router.refresh();
    });
  }

  function openEdit(p: Plan) {
    setEditPlan(p);
    setEditAmts(p.schedule.map((s) => String(s.amount)));
  }
  function saveEdit() {
    if (!editPlan) return;
    const nums = editAmts.map((a) => Number(a) || 0);
    const sum = nums.reduce((s, n) => s + n, 0);
    const mismatch = Math.abs(sum - editPlan.financed_amount) > 0.01;
    start(async () => {
      const res = await setInstallmentAmounts(editPlan.id, nums, mismatch);
      if (!res.ok) { toast.error(res.error || 'Error'); return; }
      toast.success(t('fashion.installments.amountsSaved'));
      setEditPlan(null);
      router.refresh();
    });
  }

  if (plans.length === 0) return <p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">{t('fashion.installments.empty')}</p>;

  return (
    <div className="space-y-3">
      {plans.map((p) => {
        const prog = planProgress(p.schedule, today);
        const isOpen = open === p.id;
        return (
          <Card key={p.id}><CardContent className="p-4">
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <button onClick={() => setOpen(isOpen ? null : p.id)} className="flex flex-1 flex-wrap items-center justify-between gap-2 text-start">
                <span className="font-medium">{p.customer?.name ?? '—'}</span>
                <span className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">{t('fashion.installments.remaining')}: <b className="tabular-nums">{money(prog.remaining)}</b></span>
                  {prog.overdueCount > 0 && <Badge variant="destructive">{t('fashion.installments.overdue')}: {prog.overdueCount}</Badge>}
                  {p.status === 'completed' && <Badge variant="secondary">{t('fashion.installments.paid')}</Badge>}
                </span>
              </button>
              {p.status === 'active' && (
                <Button size="sm" variant="outline" className="h-8 gap-1" disabled={pending} onClick={() => openEdit(p)}>
                  <SlidersHorizontal className="h-3.5 w-3.5" /> {t('fashion.installments.editAmounts')}
                </Button>
              )}
            </div>
            {isOpen && (
              <div className="mt-3 space-y-1">
                <div className="hidden grid-cols-12 gap-2 px-2 text-[11px] uppercase text-muted-foreground sm:grid">
                  <span className="col-span-3">{t('fashion.installments.colDue')}</span>
                  <span className="col-span-2 text-end">{t('fashion.installments.colScheduled')}</span>
                  <span className="col-span-2 text-end">{t('fashion.installments.colPaid')}</span>
                  <span className="col-span-2 text-end">{t('fashion.installments.colRemaining')}</span>
                  <span className="col-span-3 text-end">{t('fashion.installments.colAction')}</span>
                </div>
                {p.schedule.map((s) => {
                  const remaining = Math.max(s.amount - s.paid_amount, 0);
                  const overdue = isOverdue(s, today);
                  return (
                    <div key={s.id} className={`grid grid-cols-12 items-center gap-2 rounded border p-2 text-sm ${overdue ? 'border-destructive/40 bg-destructive/5' : ''}`}>
                      <span className="col-span-12 text-muted-foreground sm:col-span-3" dir="ltr">#{s.seq_no} · {s.due_date}</span>
                      <span className="col-span-4 tabular-nums sm:col-span-2 sm:text-end" dir="ltr">{money(s.amount)}</span>
                      <span className="col-span-4 tabular-nums text-success sm:col-span-2 sm:text-end" dir="ltr">{money(s.paid_amount)}</span>
                      <span className="col-span-4 tabular-nums sm:col-span-2 sm:text-end" dir="ltr">{money(remaining)}</span>
                      <span className="col-span-12 sm:col-span-3 sm:justify-self-end">
                        {s.status === 'paid'
                          ? <Badge variant="secondary">{t('fashion.installments.paid')}</Badge>
                          : (
                            <span className="flex items-center gap-1">
                              <Input
                                type="number" min="0" step="0.01" dir="ltr"
                                value={amt[s.id] ?? ''}
                                placeholder={String(remaining)}
                                onChange={(e) => setAmt((m) => ({ ...m, [s.id]: e.target.value }))}
                                className="h-8 w-24 text-center"
                              />
                              <Button size="sm" disabled={pending} onClick={() => collect(s)}>
                                {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('fashion.installments.collect')}
                              </Button>
                            </span>
                          )}
                      </span>
                    </div>
                  );
                })}
                <p className="px-2 pt-1 text-[11px] text-muted-foreground">{t('fashion.installments.flexHint')}</p>
              </div>
            )}
          </CardContent></Card>
        );
      })}

      {editPlan && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={() => !pending && setEditPlan(null)}>
          <div className="w-full max-w-md rounded-t-xl bg-card p-5 shadow-xl sm:rounded-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-1 font-semibold">{t('fashion.installments.editAmountsTitle')}</h3>
            <p className="mb-3 text-xs text-muted-foreground">{t('fashion.installments.editAmountsHint', { financed: money(editPlan.financed_amount) })}</p>
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {editPlan.schedule.map((s, i) => (
                <div key={s.id} className="flex items-center gap-2">
                  <span className="w-24 text-xs text-muted-foreground" dir="ltr">#{s.seq_no} · {s.due_date}</span>
                  <Input type="number" min="0" step="0.01" dir="ltr" value={editAmts[i] ?? ''}
                    onChange={(e) => setEditAmts((a) => a.map((x, j) => (j === i ? e.target.value : x)))} className="h-8 flex-1 text-center" />
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t('fashion.installments.colScheduled')}</span>
              <span className="tabular-nums font-medium" dir="ltr">{money(editAmts.reduce((s, a) => s + (Number(a) || 0), 0))}</span>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" disabled={pending} onClick={() => setEditPlan(null)}>{t('fashion.installments.cancel')}</Button>
              <Button disabled={pending} onClick={saveEdit} className="gap-1.5">
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{t('fashion.installments.amountsSave')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
