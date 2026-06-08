import { redirect } from 'next/navigation';
import { Wallet, Boxes, TrendingUp, Receipt } from 'lucide-react';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { getT } from '@/lib/i18n/server';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { EmptyState } from '@/components/shared/empty-state';
import { Card, CardContent } from '@/components/ui/card';
import { VAN_ACCOUNTING_ENABLED } from '@/lib/van-accounting';
import { ExpenseForm } from './expense-form';

export const dynamic = 'force-dynamic';

type Settlement = {
  id: string; settlement_date: string; warehouse_id: string | null; status: string;
  cash_variance: number; inventory_variance_value: number;
  route_revenue: number; route_gross_profit: number; route_net_profit: number;
};
type Expense = { id: string; expense_date: string; amount: number; notes: string | null; category_id: string | null };
type Category = { id: string; label: string };

const fmt = (n: number | null | undefined): string => Number(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

export default async function VanAccountingPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!hasPermission(ctx, 'reports.view')) redirect('/dashboard');

  const { t } = await getT();

  if (!VAN_ACCOUNTING_ENABLED()) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('distribution.vanAccTitle')} description={t('distribution.vanAccDescription')} />
        <EmptyState icon={<Wallet className="h-7 w-7" />} title={t('distribution.vanAccDisabled')} />
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: settlementsRaw }, { data: expensesRaw }, { data: categoriesRaw }] = await Promise.all([
    supabase.from('erp_van_day_settlements')
      .select('id, settlement_date, warehouse_id, status, cash_variance, inventory_variance_value, route_revenue, route_gross_profit, route_net_profit')
      .order('settlement_date', { ascending: false }).limit(30),
    supabase.from('erp_van_expenses').select('id, expense_date, amount, notes, category_id').order('expense_date', { ascending: false }).limit(20),
    supabase.from('erp_van_expense_categories').select('id, label').eq('is_active', true).order('label'),
  ]);
  const settlements = (settlementsRaw ?? []) as Settlement[];
  const expenses = (expensesRaw ?? []) as Expense[];
  const categories = (categoriesRaw ?? []) as Category[];

  const latest = settlements[0];
  const expensesTotal = expenses.reduce((s, e) => s + Number(e.amount ?? 0), 0);
  const isEmpty = settlements.length === 0 && expenses.length === 0;

  const cashTone = !latest ? 'info' : latest.cash_variance < 0 ? 'destructive' : latest.cash_variance > 0 ? 'warning' : 'success';
  const cashHint = !latest ? undefined : latest.cash_variance < 0 ? t('distribution.vanAccShortage') : latest.cash_variance > 0 ? t('distribution.vanAccOverage') : t('distribution.vanAccBalanced');

  return (
    <div className="space-y-6">
      <PageHeader title={t('distribution.vanAccTitle')} description={t('distribution.vanAccDescription')} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t('distribution.vanAccKpiCashVariance')} value={fmt(latest?.cash_variance)} icon={Wallet} tone={cashTone} hint={cashHint} />
        <StatCard label={t('distribution.vanAccKpiInvVariance')} value={fmt(latest?.inventory_variance_value)} icon={Boxes} tone={latest && latest.inventory_variance_value < 0 ? 'destructive' : 'info'} />
        <StatCard label={t('distribution.vanAccKpiNetProfit')} value={fmt(latest?.route_net_profit)} icon={TrendingUp} tone="success" />
        <StatCard label={t('distribution.vanAccKpiExpenses')} value={fmt(expensesTotal)} icon={Receipt} tone="warning" />
      </div>

      {isEmpty ? (
        <EmptyState icon={<Wallet className="h-7 w-7" />} title={t('distribution.vanAccEmpty')} />
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground">
                <tr className="border-b">
                  <th className="p-3 text-start">{t('distribution.vanAccColDate')}</th>
                  <th className="p-3 text-end">{t('distribution.vanAccColCashVar')}</th>
                  <th className="p-3 text-end">{t('distribution.vanAccColInvVar')}</th>
                  <th className="p-3 text-end">{t('distribution.vanAccColRevenue')}</th>
                  <th className="p-3 text-end">{t('distribution.vanAccColGross')}</th>
                  <th className="p-3 text-end">{t('distribution.vanAccColNet')}</th>
                  <th className="p-3 text-start">{t('distribution.vanAccColStatus')}</th>
                </tr>
              </thead>
              <tbody>
                {settlements.map((s) => (
                  <tr key={s.id} className="border-b last:border-0">
                    <td className="p-3">{s.settlement_date}</td>
                    <td className={`p-3 text-end ${s.cash_variance < 0 ? 'text-destructive' : ''}`}>{fmt(s.cash_variance)}</td>
                    <td className={`p-3 text-end ${s.inventory_variance_value < 0 ? 'text-destructive' : ''}`}>{fmt(s.inventory_variance_value)}</td>
                    <td className="p-3 text-end">{fmt(s.route_revenue)}</td>
                    <td className="p-3 text-end">{fmt(s.route_gross_profit)}</td>
                    <td className="p-3 text-end font-medium">{fmt(s.route_net_profit)}</td>
                    <td className="p-3">{s.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Expenses + add-expense form */}
      <Card>
        <CardContent className="space-y-4 p-4">
          <h2 className="text-sm font-semibold">{t('distribution.vanAccExpensesTitle')}</h2>
          <ExpenseForm categories={categories} />

          {expenses.length > 0 && (
            <table className="w-full text-sm">
              <tbody>
                {expenses.map((e) => (
                  <tr key={e.id} className="border-b last:border-0">
                    <td className="p-2 text-muted-foreground">{e.expense_date}</td>
                    <td className="p-2">{e.notes ?? ''}</td>
                    <td className="p-2 text-end font-medium">{fmt(e.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
