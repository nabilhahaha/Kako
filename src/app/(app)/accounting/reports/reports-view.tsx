'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import { ACCOUNT_TYPE_LABELS } from '@/lib/erp/constants';
import type { AccountType } from '@/lib/erp/types';

export interface AccountAgg {
  code: string;
  name: string;
  type: AccountType;
  debit: number;
  credit: number;
}

type Tab = 'trial' | 'income' | 'balance';

export function ReportsView({ accounts }: { accounts: AccountAgg[] }) {
  const [tab, setTab] = useState<Tab>('trial');

  return (
    <div className="space-y-4">
      <div className="flex w-fit rounded-lg border p-0.5">
        <TabBtn active={tab === 'trial'} onClick={() => setTab('trial')}>ميزان المراجعة</TabBtn>
        <TabBtn active={tab === 'income'} onClick={() => setTab('income')}>قائمة الدخل</TabBtn>
        <TabBtn active={tab === 'balance'} onClick={() => setTab('balance')}>الميزانية</TabBtn>
      </div>

      {tab === 'trial' && <TrialBalance accounts={accounts} />}
      {tab === 'income' && <IncomeStatement accounts={accounts} />}
      {tab === 'balance' && <BalanceSheet accounts={accounts} />}
    </div>
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
  const rows = accounts
    .map((a) => {
      const net = a.debit - a.credit;
      return { ...a, debitBal: net > 0 ? net : 0, creditBal: net < 0 ? -net : 0 };
    })
    .filter((r) => r.debitBal > 0.001 || r.creditBal > 0.001)
    .sort((a, b) => a.code.localeCompare(b.code));
  if (rows.length === 0) return <Empty text="لا توجد قيود مرحّلة بعد." />;

  const totalDebit = rows.reduce((s, r) => s + r.debitBal, 0);
  const totalCredit = rows.reduce((s, r) => s + r.creditBal, 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01;

  return (
    <Card>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="border-b bg-secondary/50 text-muted-foreground">
            <tr>
              <th className="p-3 text-right font-medium">الحساب</th>
              <th className="p-3 text-right font-medium">النوع</th>
              <th className="p-3 text-left font-medium">مدين</th>
              <th className="p-3 text-left font-medium">دائن</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.code} className="border-b last:border-0 hover:bg-secondary/30">
                <td className="p-3"><Code code={r.code} /> {r.name}</td>
                <td className="p-3 text-muted-foreground">{ACCOUNT_TYPE_LABELS[r.type].ar}</td>
                <td className="p-3 text-left tabular-nums" dir="ltr">{r.debitBal > 0 ? formatCurrency(r.debitBal) : '—'}</td>
                <td className="p-3 text-left tabular-nums" dir="ltr">{r.creditBal > 0 ? formatCurrency(r.creditBal) : '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 font-bold">
            <tr>
              <td className="p-3" colSpan={2}>الإجمالي</td>
              <td className="p-3 text-left tabular-nums" dir="ltr">{formatCurrency(totalDebit)}</td>
              <td className="p-3 text-left tabular-nums" dir="ltr">{formatCurrency(totalCredit)}</td>
            </tr>
          </tfoot>
        </table>
        <div className="border-t p-3 text-sm">
          {balanced ? (
            <span className="text-success">✓ الميزان متوازن</span>
          ) : (
            <span className="text-destructive">⚠ فرق: {formatCurrency(Math.abs(totalDebit - totalCredit))}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Income Statement ─────────────────────────────────────────────────────────
function IncomeStatement({ accounts }: { accounts: AccountAgg[] }) {
  const revenue = accounts
    .filter((a) => a.type === 'revenue')
    .map((a) => ({ ...a, amount: a.credit - a.debit }))
    .filter((a) => Math.abs(a.amount) > 0.001);
  const expenses = accounts
    .filter((a) => a.type === 'expense')
    .map((a) => ({ ...a, amount: a.debit - a.credit }))
    .filter((a) => Math.abs(a.amount) > 0.001);

  if (revenue.length === 0 && expenses.length === 0)
    return <Empty text="لا توجد إيرادات أو مصروفات مرحّلة بعد." />;

  const totalRev = revenue.reduce((s, r) => s + r.amount, 0);
  const totalExp = expenses.reduce((s, r) => s + r.amount, 0);
  const profit = totalRev - totalExp;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="الإيرادات" rows={revenue} total={totalRev} totalLabel="إجمالي الإيرادات" />
      <Section title="المصروفات" rows={expenses} total={totalExp} totalLabel="إجمالي المصروفات" />
      <Card className="lg:col-span-2">
        <CardContent className="flex items-center justify-between p-4">
          <span className="font-semibold">{profit >= 0 ? 'صافي الربح' : 'صافي الخسارة'}</span>
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
    return <Empty text="لا توجد أرصدة مرحّلة بعد." />;

  const equityRows = [
    ...equityAccounts,
    ...(Math.abs(profit) > 0.001
      ? [{ code: '3400', name: profit >= 0 ? 'أرباح العام الحالي' : 'خسائر العام الحالي', amount: profit }]
      : []),
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="الأصول" rows={assets} total={totalAssets} totalLabel="إجمالي الأصول" />
        <div className="space-y-4">
          <Section title="الالتزامات" rows={liabilities} total={totalLiab} totalLabel="إجمالي الالتزامات" />
          <Section title="حقوق الملكية" rows={equityRows} total={totalEquity} totalLabel="إجمالي حقوق الملكية" />
        </div>
      </div>
      <Card>
        <CardContent className="flex items-center justify-between p-4 text-sm">
          <span className="font-semibold">الأصول = الالتزامات + حقوق الملكية</span>
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
  return (
    <Card>
      <CardContent className="p-0">
        <h3 className="border-b p-3 font-semibold">{title}</h3>
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">لا يوجد.</p>
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
