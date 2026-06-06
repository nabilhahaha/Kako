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
import { collectInstallmentFlex, loadCustomerInstallments } from '../actions';
import { Loader2, Wallet } from 'lucide-react';

interface Customer { id: string; name: string; phone: string | null }
interface Sched { id: string; seq_no: number; due_date: string; amount: number; paid_amount: number; status: string }
interface Plan { id: string; financed_amount: number; status: string; schedule: Sched[] }

export function InstallmentCollect({ customers, locale }: { customers: Customer[]; locale: Locale }) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [customerId, setCustomerId] = useState('');
  const [balance, setBalance] = useState(0);
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [amt, setAmt] = useState<Record<string, string>>({});
  const [method, setMethod] = useState<'cash' | 'card'>('cash');
  const today = new Date().toISOString().slice(0, 10);
  const money = (n: number) => formatCurrency(n, 'EGP', INTL_LOCALE[locale]);

  function load(id: string) {
    setCustomerId(id); setPlans(null); setAmt({});
    if (!id) return;
    start(async () => {
      const res = await loadCustomerInstallments(id);
      if (!res.ok || !res.data) { toast.error(res.error ?? 'Error'); return; }
      setBalance(res.data.balance);
      setPlans(res.data.plans);
    });
  }

  function collect(s: Sched) {
    const remaining = Math.max(s.amount - s.paid_amount, 0);
    const raw = amt[s.id];
    const value = raw !== undefined && raw !== '' ? Number(raw) : remaining;
    if (!(value > 0)) { toast.error(t('fashion.installments.errAmount')); return; }
    start(async () => {
      const res = await collectInstallmentFlex(s.id, value, method);
      if (!res.ok) { toast.error(res.error || 'Error'); return; }
      toast.success(res.data && res.data.advance > 0
        ? t('fashion.installments.collectedAdvance', { amount: money(res.data.advance) })
        : t('fashion.installments.collected'));
      const r = await loadCustomerInstallments(customerId);
      if (r.ok && r.data) { setBalance(r.data.balance); setPlans(r.data.plans); }
      setAmt((m) => ({ ...m, [s.id]: '' }));
      router.refresh();
    });
  }

  const allSched = (plans ?? []).flatMap((p) => p.schedule.filter((s) => s.status !== 'paid'));
  const overdue = allSched.filter((s) => s.due_date < today);
  const remainingTotal = allSched.reduce((sum, s) => sum + Math.max(s.amount - s.paid_amount, 0), 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{t('fashion.installments.collectCustomer')}</span>
            <select value={customerId} onChange={(e) => load(e.target.value)} className="h-10 rounded-md border bg-background px-3">
              <option value="">{t('fashion.installments.collectChoose')}</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{t('fashion.installments.method')}</span>
            <select value={method} onChange={(e) => setMethod(e.target.value as 'cash' | 'card')} className="h-10 rounded-md border bg-background px-3">
              <option value="cash">{t('fashion.installments.methodCash')}</option>
              <option value="card">{t('fashion.installments.methodCard')}</option>
            </select>
          </label>
        </CardContent>
      </Card>

      {customerId && plans && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">{t('fashion.installments.currentBalance')}</p><p className="text-lg font-bold tabular-nums" dir="ltr">{money(balance)}</p></CardContent></Card>
            <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">{t('fashion.installments.remaining')}</p><p className="text-lg font-bold tabular-nums" dir="ltr">{money(remainingTotal)}</p></CardContent></Card>
            <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">{t('fashion.installments.overdue')}</p><p className={`text-lg font-bold tabular-nums ${overdue.length ? 'text-destructive' : ''}`} dir="ltr">{overdue.length}</p></CardContent></Card>
          </div>

          {plans.length === 0 ? (
            <p className="rounded-md border bg-card p-6 text-center text-sm text-muted-foreground">{t('fashion.installments.collectNone')}</p>
          ) : plans.map((p) => (
            <Card key={p.id}><CardContent className="space-y-1 p-3">
              {p.schedule.map((s) => {
                const remaining = Math.max(s.amount - s.paid_amount, 0);
                const isOverdue = s.due_date < today && s.status !== 'paid';
                return (
                  <div key={s.id} className={`grid grid-cols-12 items-center gap-2 rounded border p-2 text-sm ${isOverdue ? 'border-destructive/40 bg-destructive/5' : ''}`}>
                    <span className="col-span-12 text-muted-foreground sm:col-span-3" dir="ltr">#{s.seq_no} · {s.due_date}</span>
                    <span className="col-span-6 tabular-nums sm:col-span-3 sm:text-end" dir="ltr">{t('fashion.installments.colRemaining')}: {money(remaining)}</span>
                    <span className="col-span-6 sm:col-span-6 sm:justify-self-end">
                      {s.status === 'paid'
                        ? <Badge variant="secondary">{t('fashion.installments.paid')}</Badge>
                        : (
                          <span className="flex items-center gap-1">
                            <Input type="number" min="0" step="0.01" dir="ltr" value={amt[s.id] ?? ''} placeholder={String(remaining)} onChange={(e) => setAmt((m) => ({ ...m, [s.id]: e.target.value }))} className="h-8 w-24 text-center" />
                            <Button size="sm" disabled={pending} onClick={() => collect(s)}>
                              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wallet className="h-3.5 w-3.5" />}
                            </Button>
                          </span>
                        )}
                    </span>
                  </div>
                );
              })}
            </CardContent></Card>
          ))}
          <p className="text-[11px] text-muted-foreground">{t('fashion.installments.flexHint')}</p>
        </>
      )}
      {pending && !plans && <p className="text-center text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" /></p>}
    </div>
  );
}
