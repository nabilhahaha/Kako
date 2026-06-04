'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n/provider';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils';
import { INTL_LOCALE } from '@/lib/i18n/config';
import type { Locale } from '@/lib/i18n/config';
import { planProgress, isOverdue } from '@/lib/fashion/installments';
import { collectInstallment } from '../actions';

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
  const money = (n: number) => formatCurrency(n, 'EGP', INTL_LOCALE[locale]);

  function collect(s: Sched) {
    const remaining = Math.max(s.amount - s.paid_amount, 0);
    start(async () => {
      const res = await collectInstallment(s.id, remaining, 'cash');
      if (res.ok) { toast.success(t('fashion.installments.collected')); router.refresh(); }
      else toast.error(res.error || 'Error');
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
            <button onClick={() => setOpen(isOpen ? null : p.id)} className="flex w-full flex-wrap items-center justify-between gap-2 text-start">
              <span className="font-medium">{p.customer?.name ?? '—'}</span>
              <span className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">{t('fashion.installments.remaining')}: <b className="tabular-nums">{money(prog.remaining)}</b></span>
                {prog.overdueCount > 0 && <Badge variant="destructive">{t('fashion.installments.overdue')}: {prog.overdueCount}</Badge>}
                {p.status === 'completed' && <Badge variant="secondary">{t('fashion.installments.paid')}</Badge>}
              </span>
            </button>
            {isOpen && (
              <div className="mt-3 space-y-1">
                {p.schedule.map((s) => {
                  const remaining = Math.max(s.amount - s.paid_amount, 0);
                  const overdue = isOverdue(s, today);
                  return (
                    <div key={s.id} className={`flex items-center justify-between gap-2 rounded border p-2 text-sm ${overdue ? 'border-destructive/40 bg-destructive/5' : ''}`}>
                      <span className="text-muted-foreground">#{s.seq_no} · {s.due_date}</span>
                      <span className="tabular-nums">{money(s.amount)}{s.paid_amount > 0 && s.status !== 'paid' ? ` (${money(s.paid_amount)})` : ''}</span>
                      {s.status === 'paid'
                        ? <Badge variant="secondary">{t('fashion.installments.paid')}</Badge>
                        : <Button size="sm" disabled={pending} onClick={() => collect(s)}>{t('fashion.installments.collect')} {money(remaining)}</Button>}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent></Card>
        );
      })}
    </div>
  );
}
