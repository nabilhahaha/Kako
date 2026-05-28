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
  const [tab, setTab] = useState<Tab>('trial');

  return (
    <div className="space-y-4">
      <div className="flex w-fit flex-wrap rounded-lg border p-0.5">
        <TabBtn active={tab === 'trial'} onClick={() => setTab('trial')}>ميزان المراجعة</TabBtn>
        <TabBtn active={tab === 'income'} onClick={() => setTab('income')}>قائمة الدخل</TabBtn>
        <TabBtn active={tab === 'balance'} onClick={() => setTab('balance')}>الميزانية</TabBtn>
        <TabBtn active={tab === 'aging'} onClick={() => setTab('aging')}>أعمار الديون</TabBtn>
        <TabBtn active={tab === 'margin'} onClick={() => setTab('margin')}>هامش الربح</TabBtn>
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
  if (rows.length === 0) return <Empty text="لا توجد ديون مستحقة على العملاء." />;
  const t = rows.reduce(
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
                <th className="p-3 text-right font-medium">العميل</th>
                <th className="p-3 text-left font-medium">٠-٣٠ يوم</th>
                <th className="p-3 text-left font-medium">٣١-٦٠</th>
                <th className="p-3 text-left font-medium">٦١-٩٠</th>
                <th className="p-3 text-left font-medium">+٩٠</th>
                <th className="p-3 text-left font-medium">الإجمالي</th>
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
                <td className="p-3">الإجمالي</td>
                <td className="p-3 text-left tabular-nums" dir="ltr">{formatCurrency(t.d0_30)}</td>
                <td className="p-3 text-left tabular-nums" dir="ltr">{formatCurrency(t.d31_60)}</td>
                <td className="p-3 text-left tabular-nums" dir="ltr">{formatCurrency(t.d61_90)}</td>
                <td className="p-3 text-left tabular-nums" dir="ltr">{formatCurrency(t.d90)}</td>
                <td className="p-3 text-left tabular-nums" dir="ltr">{formatCurrency(t.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function Margin({ rows }: { rows: MarginRow[] }) {
  if (rows.length === 0) return <Empty text="لا توجد مبيعات لحساب الهامش." />;
  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-secondary/50 text-muted-foreground">
              <tr>
                <th className="p-3 text-right font-medium">الصنف</th>
                <th className="p-3 text-center font-medium">الكمية المباعة</th>
                <th className="p-3 text-left font-medium">الإيراد</th>
                <th className="p-3 text-left font-medium">التكلفة</th>
                <th className="p-3 text-left font-medium">الربح</th>
                <th className="p-3 text-center font-medium">الهامش %</th>
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
