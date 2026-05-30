'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import { ACCOUNT_TYPE_LABELS } from '@/lib/erp/constants';
import type { AccountType } from '@/lib/erp/types';
import { useI18n } from '@/lib/i18n/provider';

export interface AccountAgg {
  code: string;
  name: string;
  type: AccountType;
  debit: number;
  credit: number;
}

export interface AgingRow {
  customer: string;
  d0_30: number;
  d31_60: number;
  d61_90: number;
  d90: number;
  total: number;
}

export interface MarginRow {
  code: string;
  name: string;
  qty: number;
  revenue: number;
  cost: number;
}

type Tab = 'trial' | 'income' | 'balance' | 'aging' | 'margin';

export function ReportsView({
  accounts,
  aging,
  margin,
}: {
  accounts: AccountAgg[];
  aging: AgingRow[];
  margin: MarginRow[];
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('trial');

  return (
    <div className="space-y-4">
      <div className="flex w-fit flex-wrap rounded-lg border p-0.5">
        <TabBtn active={tab === 'trial'} onClick={() => setTab('trial')}>{t('accounting.reports.tabTrial')}</TabBtn>
        <TabBtn active={tab === 'income'} onClick={() => setTab('income')}>{t('accounting.reports.tabIncome')}</TabBtn>
        <TabBtn active={tab === 'balance'} onClick={() => setTab('balance')}>{t('accounting.reports.tabBalance')}</TabBtn>
        <TabBtn active={tab === 'aging'} onClick={() => setTab('aging')}>{t('accounting.reports.tabAging')}</TabBtn>
        <TabBtn active={tab === 'margin'} onClick={() => setTab('margin')}>{t('accounting.reports.tabMargin')}</TabBtn>
      </div>

      {tab === 'trial' && <TrialBalance accounts={accounts} />}
      {tab === 'income' && <IncomeStatement accounts={accounts} />}
      {tab === 'balance' && <BalanceSheet accounts={accounts} />}
      {tab === 'aging' && <Aging rows={aging} />}
      {tab === 'margin' && <Margin rows={margin} />}
    </div>
  );
}

function Aging({ rows }: { rows: AgingRow[] }) {
  const { t } = useI18n();
  if (rows.length === 0) return <Empty text={t('accounting.reports.agingEmpty')} />;
  const totals = rows.reduce(
    (a, r) => ({ d0_30: a.d0_30 + r.d0_30, d31_60: a.d31_60 + r.d31_60, d61_90: a.d61_90 + r.d61_90, d90: a.d90 + r.d90, total: a.total + r.total }),
    { d0_30: 0, d31_60: 0, d61_90: 0, d90: 0, total: 0 },
  );
  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-secondary/50 text-muted-foreground">
              <tr>
                <th className="p-3 text-start font-medium">{t('accounting.reports.agingColCustomer')}</th>
                <th className="p-3 text-end font-medium">{t('accounting.reports.agingCol030')}</th>
                <th className="p-3 text-end font-medium">{t('accounting.reports.agingCol3160')}</th>
                <th className="p-3 text-end font-medium">{t('accounting.reports.agingCol6190')}</th>
                <th className="p-3 text-end font-medium">{t('accounting.reports.agingCol90p')}</th>
                <th className="p-3 text-end font-medium">{t('accounting.reports.agingColTotal')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b last:border-0 hover:bg-secondary/30">
                  <td className="p-3 font-medium">{r.customer}</td>
                  <td className="p-3 text-left tabular-nums" dir="ltr">{r.d0_30 ? formatCurrency(r.d0_30) : '—'}</td>
                  <td className="p-3 text-left tabular-nums" dir="ltr">{r.d31_60 ? formatCurrency(r.d31_60) : '—'}</td>
                  <td className="p-3 text-left tabular-nums" dir="ltr">{r.d61_90 ? formatCurrency(r.d61_90) : '—'}</td>
                  <td className="p-3 text-left tabular-nums text-destructive" dir="ltr">{r.d90 ? formatCurrency(r.d90) : '—'}</td>
                  <td className="p-3 text-left font-medium tabular-nums" dir="ltr">{formatCurrency(r.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 font-bold">
              <tr>
                <td className="p-3">{t('accounting.reports.agingTotal')}</td>
                <td className="p-3 text-left tabular-nums" dir="ltr">{formatCurrency(totals.d0_30)}</td>
                <td className="p-3 text-left tabular-nums" dir="ltr">{formatCurrency(totals.d31_60)}</td>
                <td className="p-3 text-left tabular-nums" dir="ltr">{formatCurrency(totals.d61_90)}</td>
                <td className="p-3 text-left tabular-nums" dir="ltr">{formatCurrency(totals.d90)}</td>
                <td className="p-3 text-left tabular-nums" dir="ltr">{formatCurrency(totals.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function Margin({ rows }: { rows: MarginRow[] }) {
  const { t } = useI18n();
  if (rows.length === 0) return <Empty text={t('accounting.reports.marginEmpty')} />;
  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-secondary/50 text-muted-foreground">
              <tr>
                <th className="p-3 text-start font-medium">{t('accounting.reports.marginColItem')}</th>
                <th className="p-3 text-center font-medium">{t('accounting.reports.marginColQtySold')}</th>
                <th className="p-3 text-end font-medium">{t('accounting.reports.marginColRevenue')}</th>
                <th className="p-3 text-end font-medium">{t('accounting.reports.marginColCost')}</th>
                <th className="p-3 text-end font-medium">{t('accounting.reports.marginColProfit')}</th>
                <th className="p-3 text-center font-medium">{t('accounting.reports.marginColMarginPct')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const profit = r.revenue - r.cost;
                const pct = r.revenue > 0 ? (profit / r.revenue) * 100 : 0;
                return (
                  <tr key={r.code} className="border-b last:border-0 hover:bg-secondary/30">
                    <td className="p-3"><Code code={r.code} /> {r.name}</td>
                    <td className="p-3 text-center tabular-nums" dir="ltr">{r.qty}</td>
                    <td className="p-3 text-left tabular-nums" dir="ltr">{formatCurrency(r.revenue)}</td>
                    <td className="p-3 text-left tabular-nums text-muted-foreground" dir="ltr">{formatCurrency(r.cost)}</td>
                    <td className={`p-3 text-left tabular-nums ${profit >= 0 ? 'text-success' : 'text-destructive'}`} dir="ltr">{formatCurrency(profit)}</td>
                    <td className={`p-3 text-center tabular-nums ${profit >= 0 ? '' : 'text-destructive'}`} dir="ltr">{pct.toFixed(1)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm ${active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
    >
      {children}
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <Card>
      <CardContent className="p-8 text-center text-muted-foreground">{text}</CardContent>
    </Card>
  );
}

// ─── Trial Balance ──────────────────────────────────────────────────────────
function TrialBalance({ accounts }: { accounts: AccountAgg[] }) {
  const { t, locale } = useI18n();
  const rows = accounts
    .map((a) => {
      const net = a.debit - a.credit;
      return { ...a, debitBal: net > 0 ? net : 0, creditBal: net < 0 ? -net : 0 };
    })
    .filter((r) => r.debitBal > 0.001 || r.creditBal > 0.001)
    .sort((a, b) => a.code.localeCompare(b.code));
  if (rows.length === 0) return <Empty text={t('accounting.reports.trialEmpty')} />;

  const totalDebit = rows.reduce((s, r) => s + r.debitBal, 0);
  const totalCredit = rows.reduce((s, r) => s + r.creditBal, 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01;

  return (
    <Card>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="border-b bg-secondary/50 text-muted-foreground">
            <tr>
              <th className="p-3 text-start font-medium">{t('accounting.reports.trialColAccount')}</th>
              <th className="p-3 text-start font-medium">{t('accounting.reports.trialColType')}</th>
              <th className="p-3 text-end font-medium">{t('accounting.reports.trialColDebit')}</th>
              <th className="p-3 text-end font-medium">{t('accounting.reports.trialColCredit')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.code} className="border-b last:border-0 hover:bg-secondary/30">
                <td className="p-3"><Code code={r.code} /> {r.name}</td>
                <td className="p-3 text-muted-foreground">{ACCOUNT_TYPE_LABELS[r.type][locale]}</td>
                <td className="p-3 text-left tabular-nums" dir="ltr">{r.debitBal > 0 ? formatCurrency(r.debitBal) : '—'}</td>
                <td className="p-3 text-left tabular-nums" dir="ltr">{r.creditBal > 0 ? formatCurrency(r.creditBal) : '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 font-bold">
            <tr>
              <td className="p-3" colSpan={2}>{t('accounting.reports.trialTotal')}</td>
              <td className="p-3 text-left tabular-nums" dir="ltr">{formatCurrency(totalDebit)}</td>
              <td className="p-3 text-left tabular-nums" dir="ltr">{formatCurrency(totalCredit)}</td>
            </tr>
          </tfoot>
        </table>
        <div className="border-t p-3 text-sm">
          {balanced ? (
            <span className="text-success">{t('accounting.reports.trialBalanced')}</span>
          ) : (
            <span className="text-destructive">{t('accounting.reports.trialDiff', { amount: formatCurrency(Math.abs(totalDebit - totalCredit)) })}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Income Statement ─────────────────────────────────────────────────────────
function IncomeStatement({ accounts }: { accounts: AccountAgg[] }) {
  const { t } = useI18n();
  const revenue = accounts
    .filter((a) => a.type === 'revenue')
    .map((a) => ({ ...a, amount: a.credit - a.debit }))
    .filter((a) => Math.abs(a.amount) > 0.001);
  const expenses = accounts
    .filter((a) => a.type === 'expense')
    .map((a) => ({ ...a, amount: a.debit - a.credit }))
    .filter((a) => Math.abs(a.amount) > 0.001);

  if (revenue.length === 0 && expenses.length === 0)
    return <Empty text={t('accounting.reports.incomeEmpty')} />;

  const totalRev = revenue.reduce((s, r) => s + r.amount, 0);
  const totalExp = expenses.reduce((s, r) => s + r.amount, 0);
  const profit = totalRev - totalExp;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title={t('accounting.reports.incomeRevenue')} rows={revenue} total={totalRev} totalLabel={t('accounting.reports.incomeTotalRevenue')} />
      <Section title={t('accounting.reports.incomeExpenses')} rows={expenses} total={totalExp} totalLabel={t('accounting.reports.incomeTotalExpenses')} />
      <Card className="lg:col-span-2">
        <CardContent className="flex items-center justify-between p-4">
          <span className="font-semibold">{profit >= 0 ? t('accounting.reports.incomeNetProfit') : t('accounting.reports.incomeNetLoss')}</span>
          <span className={`text-lg font-bold tabular-nums ${profit >= 0 ? 'text-success' : 'text-destructive'}`} dir="ltr">
            {formatCurrency(Math.abs(profit))}
          </span>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Balance Sheet ────────────────────────────────────────────────────────────
function BalanceSheet({ accounts }: { accounts: AccountAgg[] }) {
  const { t } = useI18n();
  const assets = accounts
    .filter((a) => a.type === 'asset')
    .map((a) => ({ ...a, amount: a.debit - a.credit }))
    .filter((a) => Math.abs(a.amount) > 0.001);
  const liabilities = accounts
    .filter((a) => a.type === 'liability')
    .map((a) => ({ ...a, amount: a.credit - a.debit }))
    .filter((a) => Math.abs(a.amount) > 0.001);
  const equityAccounts = accounts
    .filter((a) => a.type === 'equity')
    .map((a) => ({ ...a, amount: a.credit - a.debit }))
    .filter((a) => Math.abs(a.amount) > 0.001);

  // Current period profit flows into equity.
  const totalRev = accounts.filter((a) => a.type === 'revenue').reduce((s, a) => s + (a.credit - a.debit), 0);
  const totalExp = accounts.filter((a) => a.type === 'expense').reduce((s, a) => s + (a.debit - a.credit), 0);
  const profit = totalRev - totalExp;

  const totalAssets = assets.reduce((s, a) => s + a.amount, 0);
  const totalLiab = liabilities.reduce((s, a) => s + a.amount, 0);
  const totalEquity = equityAccounts.reduce((s, a) => s + a.amount, 0) + profit;
  const rhs = totalLiab + totalEquity;
  const balanced = Math.abs(totalAssets - rhs) < 0.01;

  if (assets.length === 0 && liabilities.length === 0 && equityAccounts.length === 0 && Math.abs(profit) < 0.001)
    return <Empty text={t('accounting.reports.balanceEmpty')} />;

  const equityRows = [
    ...equityAccounts,
    ...(Math.abs(profit) > 0.001
      ? [{ code: '3400', name: profit >= 0 ? t('accounting.reports.balanceCurrentYearProfit') : t('accounting.reports.balanceCurrentYearLoss'), amount: profit }]
      : []),
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={t('accounting.reports.balanceAssets')} rows={assets} total={totalAssets} totalLabel={t('accounting.reports.balanceTotalAssets')} />
        <div className="space-y-4">
          <Section title={t('accounting.reports.balanceLiabilities')} rows={liabilities} total={totalLiab} totalLabel={t('accounting.reports.balanceTotalLiabilities')} />
          <Section title={t('accounting.reports.balanceEquity')} rows={equityRows} total={totalEquity} totalLabel={t('accounting.reports.balanceTotalEquity')} />
        </div>
      </div>
      <Card>
        <CardContent className="flex items-center justify-between p-4 text-sm">
          <span className="font-semibold">{t('accounting.reports.balanceEquation')}</span>
          <span dir="ltr" className="tabular-nums">
            {formatCurrency(totalAssets)} {balanced ? '=' : '≠'} {formatCurrency(rhs)}
          </span>
        </CardContent>
      </Card>
    </div>
  );
}

function Section({
  title,
  rows,
  total,
  totalLabel,
}: {
  title: string;
  rows: Array<{ code: string; name: string; amount: number }>;
  total: number;
  totalLabel: string;
}) {
  const { t } = useI18n();
  return (
    <Card>
      <CardContent className="p-0">
        <h3 className="border-b p-3 font-semibold">{title}</h3>
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">{t('accounting.reports.sectionEmpty')}</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {rows.map((r) => (
                <tr key={r.code} className="border-b last:border-0">
                  <td className="p-2 ps-3"><Code code={r.code} /> {r.name}</td>
                  <td className="p-2 pe-3 text-left tabular-nums" dir="ltr">{formatCurrency(r.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 font-bold">
              <tr>
                <td className="p-3">{totalLabel}</td>
                <td className="p-3 text-left tabular-nums" dir="ltr">{formatCurrency(total)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

function Code({ code }: { code: string }) {
  return <span className="me-2 font-mono text-xs text-muted-foreground" dir="ltr">{code}</span>;
}
