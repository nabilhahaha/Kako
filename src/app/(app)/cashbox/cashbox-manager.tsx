'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n/provider';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCurrency, formatDate } from '@/lib/utils';
import { cashVariance } from '@/lib/fashion/cashbox';
import { CriticalActionButton } from '@/lib/critical-action';
import { openShift, postExpense, closeShift } from './actions';

interface Summary { openingFloat: number; inflows: number; outflows: number; expected: number }

export interface ShiftHistoryRow {
  id: string;
  opening: number;
  expected: number | null;
  counted: number | null;
  variance: number | null;
  closedAt: string | null;
  cashier: string;
}

interface ActiveSession { id: string; openingFloat: number; openedAt: string; openedBy: string }

export function CashboxManager({
  session, summary, lastCounted, history, intlLocale,
}: {
  session: ActiveSession | null;
  summary: Summary | null;
  lastCounted: number;
  history: ShiftHistoryRow[];
  intlLocale: string;
}) {
  const router = useRouter();
  const money = (n: number) => formatCurrency(n, 'EGP', intlLocale);

  return (
    <div className="space-y-4">
      {session && summary
        ? <ActiveShift session={session} summary={summary} money={money} onDone={() => router.refresh()} />
        : <OpenShift lastCounted={lastCounted} money={money} onDone={() => router.refresh()} />}
      <History rows={history} money={money} intlLocale={intlLocale} />
    </div>
  );
}

function OpenShift({ lastCounted, money, onDone }: {
  lastCounted: number; money: (n: number) => string; onDone: () => void;
}) {
  const { t } = useI18n();
  const [pending, start] = useTransition();
  const [opening, setOpening] = useState(lastCounted);

  return (
    <Card className="max-w-md">
      <CardContent className="space-y-3 p-4">
        <h2 className="text-sm font-semibold">{t('cashbox.openTitle')}</h2>
        <p className="text-xs text-muted-foreground">{t('cashbox.noOpenShift')}</p>
        <label className="block text-xs">
          {t('cashbox.openingFloat')}
          <Input
            type="number" step="0.01" value={opening}
            onChange={(e) => setOpening(Number(e.target.value) || 0)}
            className="mt-1"
          />
        </label>
        {lastCounted > 0 && (
          <p className="text-xs text-muted-foreground">
            {t('cashbox.carryForward')}: <span className="font-medium tabular-nums">{money(lastCounted)}</span>
          </p>
        )}
        <Button
          className="w-full"
          disabled={pending}
          onClick={() => start(async () => {
            const res = await openShift(opening);
            if (res.ok) { toast.success(t('cashbox.openCta')); onDone(); }
            else toast.error(res.error || t('shared.errorGeneric'));
          })}
        >
          {t('cashbox.openCta')}
        </Button>
      </CardContent>
    </Card>
  );
}

function ActiveShift({ session, summary, money, onDone }: {
  session: ActiveSession; summary: Summary; money: (n: number) => string; onDone: () => void;
}) {
  const { t } = useI18n();
  const [counted, setCounted] = useState(summary.expected);
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState('');
  const variance = cashVariance(counted, summary.expected);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* ── Active shift + close (critical action) ── */}
      <Card>
        <CardContent className="space-y-2 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">{t('cashbox.activeShift')}</h2>
            <span className="text-xs text-muted-foreground">
              {t('cashbox.openedBy')}: {session.openedBy}
            </span>
          </div>
          <Row label={t('cashbox.openingFloat')} value={money(summary.openingFloat)} />
          <Row label={t('cashbox.inflows')} value={money(summary.inflows)} />
          <Row label={t('cashbox.outflows')} value={'-' + money(summary.outflows)} />
          <div className="border-t pt-2"><Row label={t('cashbox.expected')} value={money(summary.expected)} bold /></div>

          <div className="space-y-2 border-t pt-3">
            <label className="block text-xs">
              {t('cashbox.counted')}
              <Input
                type="number" step="0.01" value={counted}
                onChange={(e) => setCounted(Number(e.target.value) || 0)}
                className="mt-1"
              />
            </label>
            <Row
              label={t('cashbox.variance')}
              value={`${money(variance)} ${variance > 0 ? t('cashbox.over') : variance < 0 ? t('cashbox.short') : t('cashbox.balanced')}`}
            />
            <p className="text-xs text-muted-foreground">{t('cashbox.handoverNote')}</p>
            <CriticalActionButton
              variant="destructive"
              className="w-full"
              config={{
                action: t('cashbox.actClose'),
                record: t('cashbox.recShift', { date: formatDate(session.openedAt) }),
                user: session.openedBy,
                irreversible: true,
                execute: async () => {
                  const res = await closeShift({ sessionId: session.id, counted });
                  return { ok: res.ok, error: res.error, data: res.data, printHref: res.data?.printHref };
                },
                onDone,
              }}
            >
              {t('cashbox.closeCta')}
            </CriticalActionButton>
          </div>
        </CardContent>
      </Card>

      {/* ── Record expense (critical action with reason) ── */}
      <Card className="h-fit">
        <CardContent className="space-y-2 p-4">
          <h2 className="text-sm font-semibold">{t('cashbox.addExpense')}</h2>
          <Input
            value={category} onChange={(e) => setCategory(e.target.value)}
            placeholder={t('cashbox.expenseCategory')}
          />
          <Input
            type="number" step="0.01" value={amount || ''}
            onChange={(e) => setAmount(Number(e.target.value) || 0)}
            placeholder={t('cashbox.amount')}
          />
          <Input
            value={note} onChange={(e) => setNote(e.target.value)}
            placeholder={t('cashbox.note')}
          />
          <CriticalActionButton
            className="w-full"
            disabled={!category.trim() || amount <= 0}
            config={{
              action: t('cashbox.actExpense'),
              record: `${category || '—'} — ${money(amount)}`,
              requireReason: true,
              execute: async (reason) => {
                const res = await postExpense({ category, amount, note, reason });
                return { ok: res.ok, error: res.error };
              },
              onDone: () => { setCategory(''); setAmount(0); setNote(''); onDone(); },
            }}
          >
            {t('cashbox.postExpense')}
          </CriticalActionButton>
        </CardContent>
      </Card>
    </div>
  );
}

function History({ rows, money, intlLocale }: {
  rows: ShiftHistoryRow[]; money: (n: number) => string; intlLocale: string;
}) {
  const { t } = useI18n();
  return (
    <Card>
      <CardContent className="p-4">
        <h2 className="mb-3 text-sm font-semibold">{t('cashbox.history')}</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('cashbox.noHistory')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-start text-xs text-muted-foreground">
                  <th className="py-2 text-start font-medium">{t('cashbox.histClosedBy')}</th>
                  <th className="py-2 text-end font-medium">{t('cashbox.histOpening')}</th>
                  <th className="py-2 text-end font-medium">{t('cashbox.histExpected')}</th>
                  <th className="py-2 text-end font-medium">{t('cashbox.histCounted')}</th>
                  <th className="py-2 text-end font-medium">{t('cashbox.histVariance')}</th>
                  <th className="py-2 text-end font-medium">{t('cashbox.histClosedAt')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2">{r.cashier}</td>
                    <td className="py-2 text-end tabular-nums">{money(r.opening)}</td>
                    <td className="py-2 text-end tabular-nums">{r.expected == null ? '—' : money(r.expected)}</td>
                    <td className="py-2 text-end tabular-nums">{r.counted == null ? '—' : money(r.counted)}</td>
                    <td className={`py-2 text-end tabular-nums ${r.variance && r.variance !== 0 ? 'text-destructive' : ''}`}>
                      {r.variance == null ? '—' : money(r.variance)}
                    </td>
                    <td className="py-2 text-end text-xs text-muted-foreground">
                      {formatDate(r.closedAt, intlLocale)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between text-sm ${bold ? 'font-bold' : ''}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
