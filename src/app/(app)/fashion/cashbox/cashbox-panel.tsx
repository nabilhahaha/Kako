'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n/provider';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/utils';
import { INTL_LOCALE } from '@/lib/i18n/config';
import type { Locale } from '@/lib/i18n/config';
import { cashVariance, type cashboxSummary } from '@/lib/fashion/cashbox';
import { openCashbox, closeCashbox, reopenCashbox, addExpense, ownerCash, cashAdjust } from '../actions';
import { Printer } from 'lucide-react';

type Summary = ReturnType<typeof cashboxSummary>;
interface Session {
  id: string; opening_float: number; opened_at: string; branch_id: string | null;
  status: 'open' | 'draft_closed'; closing_counted: number | null; notes: string | null;
}

export function CashboxPanel({
  session, summary, cardSales, transferSales, canManage, defaultOpening, locale,
}: {
  session: Session | null;
  summary: Summary | null;
  cardSales: number;
  transferSales: number;
  canManage: boolean;
  defaultOpening: number;
  locale: Locale;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [counted, setCounted] = useState(0);
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState('');
  const money = (n: number) => formatCurrency(n, 'EGP', INTL_LOCALE[locale]);
  const branchId = session?.branch_id ?? '';

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string, form?: HTMLFormElement) =>
    start(async () => {
      const res = await fn();
      if (res.ok) { toast.success(ok); form?.reset(); router.refresh(); } else toast.error(res.error || 'Error');
    });

  // ── No open session → open form (with carry-forward default) ──
  if (!session || !summary) {
    return (
      <Card className="max-w-md"><CardContent className="p-4">
        <p className="mb-3 text-sm text-muted-foreground">{t('fashion.cashbox.noOpen')}</p>
        <form onSubmit={(e) => { e.preventDefault(); run(() => openCashbox(new FormData(e.currentTarget)), t('fashion.cashbox.opened')); }} className="flex items-end gap-2">
          <label className="flex-1 text-xs">{t('fashion.cashbox.openingFloat')}
            <Input name="opening_float" type="number" step="0.01" defaultValue={defaultOpening || 0} className="mt-1" />
          </label>
          <Button type="submit" disabled={pending}>{t('fashion.cashbox.open')}</Button>
        </form>
        {defaultOpening > 0 && <p className="mt-2 text-xs text-muted-foreground">{t('fashion.cashbox.carriedHint')}: {money(defaultOpening)}</p>}
      </CardContent></Card>
    );
  }

  const isDraft = session.status === 'draft_closed';
  const draftCounted = Number(session.closing_counted) || 0;
  const liveVariance = cashVariance(counted, summary.expected);
  const draftVariance = cashVariance(draftCounted, summary.expected);

  const Breakdown = (
    <div className="space-y-1.5">
      <Row label={t('fashion.cashbox.openingFloat')} value={money(summary.openingFloat)} />
      <Row label={t('fashion.cashbox.cashSales')} value={money(summary.cashSales)} />
      <Row label={t('fashion.cashbox.cardSales')} value={money(cardSales)} muted />
      <Row label={t('fashion.cashbox.transferSales')} value={money(transferSales)} muted />
      <Row label={t('fashion.cashbox.collections')} value={money(summary.collections)} />
      <Row label={t('fashion.cashbox.expenses')} value={'-' + money(summary.expenses)} />
      <Row label={t('fashion.cashbox.ownerDeposits')} value={money(summary.ownerDeposits)} />
      <Row label={t('fashion.cashbox.ownerWithdrawals')} value={'-' + money(summary.ownerWithdrawals)} />
      {summary.adjustments !== 0 && <Row label={t('fashion.cashbox.adjustments')} value={money(summary.adjustments)} />}
      <div className="border-t pt-2"><Row label={t('fashion.cashbox.expected')} value={money(summary.expected)} bold /></div>
    </div>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardContent className="space-y-2 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">{t('fashion.cashbox.dailyClosing')}</h2>
          {isDraft && <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs text-warning">{t('fashion.cashbox.draft')}</span>}
        </div>
        {Breakdown}

        {!isDraft ? (
          // ── Open: enter count, save draft or finalize ──
          <form onSubmit={(e) => e.preventDefault()} className="space-y-2 border-t pt-3">
            <label className="block text-xs">{t('fashion.cashbox.counted')}
              <Input type="number" step="0.01" value={counted} onChange={(e) => setCounted(Number(e.target.value) || 0)} className="mt-1" />
            </label>
            <Row label={t('fashion.cashbox.variance')} value={money(liveVariance)} tone={liveVariance < 0 ? 'short' : liveVariance > 0 ? 'over' : undefined} />
            <label className="block text-xs">{t('fashion.cashbox.notes')}
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" disabled={pending} onClick={() => run(() => closeCashbox(session.id, counted, notes, false), t('fashion.cashbox.draftSaved'))}>
                {t('fashion.cashbox.saveDraft')}
              </Button>
              <Button type="button" disabled={pending} onClick={() => run(() => closeCashbox(session.id, counted, notes, true), t('fashion.cashbox.closed'))}>
                {t('fashion.cashbox.finalClose')}
              </Button>
            </div>
          </form>
        ) : (
          // ── Draft: finalize / reopen (manager) / print report ──
          <div className="space-y-2 border-t pt-3 text-sm">
            <Row label={t('fashion.cashbox.counted')} value={money(draftCounted)} />
            <Row label={t('fashion.cashbox.variance')} value={money(draftVariance)} tone={draftVariance < 0 ? 'short' : draftVariance > 0 ? 'over' : undefined} />
            {session.notes && <p className="text-xs text-muted-foreground">{t('fashion.cashbox.notes')}: {session.notes}</p>}
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={pending} onClick={() => run(() => closeCashbox(session.id, draftCounted, session.notes ?? '', true), t('fashion.cashbox.closed'))}>
                {t('fashion.cashbox.finalClose')}
              </Button>
              <Link href={`/print/fashion/closing/${session.id}`} target="_blank" className="inline-flex items-center gap-1 rounded-md border px-3 py-2 text-xs font-medium hover:bg-secondary">
                <Printer className="h-3.5 w-3.5" /> {t('fashion.cashbox.report')}
              </Link>
            </div>
            {canManage ? (
              <form onSubmit={(e) => { e.preventDefault(); run(() => reopenCashbox(session.id, reason), t('fashion.cashbox.reopened')); }} className="space-y-2 border-t pt-2">
                <label className="block text-xs">{t('fashion.cashbox.reopenReason')}
                  <Input value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1" required />
                </label>
                <Button type="submit" variant="outline" className="w-full" disabled={pending}>{t('fashion.cashbox.reopen')}</Button>
              </form>
            ) : (
              <p className="border-t pt-2 text-xs text-muted-foreground">{t('fashion.cashbox.reopenManagerOnly')}</p>
            )}
          </div>
        )}
      </CardContent></Card>

      {/* Entry forms only while the box is open */}
      {!isDraft && (
        <div className="space-y-4">
          <Card><CardContent className="p-4">
            <h2 className="mb-2 text-sm font-semibold">{t('fashion.cashbox.addExpense')}</h2>
            <form onSubmit={(e) => { e.preventDefault(); const f = e.currentTarget; run(() => addExpense(new FormData(f)), t('fashion.common.save'), f); }} className="space-y-2">
              <Input name="category" placeholder={t('fashion.cashbox.expenseCategory')} required />
              <Input name="amount" type="number" step="0.01" placeholder={t('fashion.cashbox.amount')} required />
              <Button type="submit" className="w-full" disabled={pending}>{t('fashion.common.add')}</Button>
            </form>
          </CardContent></Card>

          {canManage && (
            <Card><CardContent className="p-4">
              <h2 className="mb-2 text-sm font-semibold">{t('fashion.cashbox.ownerAccounting')}</h2>
              <form onSubmit={(e) => { e.preventDefault(); const f = e.currentTarget; run(() => ownerCash(new FormData(f)), t('fashion.common.save'), f); }} className="space-y-2">
                <input type="hidden" name="branch_id" value={branchId} />
                <div className="grid grid-cols-2 gap-2">
                  <Input name="amount" type="number" step="0.01" min="0" placeholder={t('fashion.cashbox.amount')} required />
                  <select name="direction" className="h-10 rounded-md border bg-background px-2 text-sm">
                    <option value="withdrawal">{t('fashion.cashbox.ownerWithdrawal')}</option>
                    <option value="deposit">{t('fashion.cashbox.ownerDeposit')}</option>
                  </select>
                </div>
                <Input name="note" placeholder={t('fashion.cashbox.note')} />
                <Button type="submit" variant="outline" className="w-full" disabled={pending}>{t('fashion.cashbox.recordOwner')}</Button>
              </form>

              <h3 className="mb-1 mt-4 text-xs font-semibold text-muted-foreground">{t('fashion.cashbox.adjustment')}</h3>
              <form onSubmit={(e) => { e.preventDefault(); const f = e.currentTarget; run(() => cashAdjust(new FormData(f)), t('fashion.common.save'), f); }} className="space-y-2">
                <input type="hidden" name="branch_id" value={branchId} />
                <Input name="amount" type="number" step="0.01" placeholder={t('fashion.cashbox.adjustmentHint')} required />
                <Input name="note" placeholder={t('fashion.cashbox.note')} />
                <Button type="submit" variant="outline" className="w-full" disabled={pending}>{t('fashion.cashbox.recordAdjustment')}</Button>
              </form>
            </CardContent></Card>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, bold, muted, tone }: { label: string; value: string; bold?: boolean; muted?: boolean; tone?: 'short' | 'over' }) {
  const toneClass = tone === 'short' ? 'text-destructive' : tone === 'over' ? 'text-success' : '';
  return (
    <div className={`flex justify-between text-sm ${bold ? 'font-bold' : ''} ${muted ? 'text-muted-foreground' : ''}`}>
      <span className={muted ? '' : 'text-muted-foreground'}>{label}</span>
      <span className={`tabular-nums ${toneClass}`}>{value}</span>
    </div>
  );
}
