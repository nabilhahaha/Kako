import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { requireAnyPermission } from '@/lib/erp/guards';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import { summarizeExpenses, netCashAfterExpenses, type ExpenseRow } from '@/lib/fashion/expenses';
import { ExpensesManager, type FashionExpense } from './expenses-manager';

function monthStart(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function FashionExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; category?: string }>;
}) {
  const ctx = await requireAnyPermission(['fashion.cashbox', 'fashion.reports']);
  const u = await getUserContext();
  if (!u) redirect('/login');
  const { t, locale } = await getT();
  const canCreate = u.permissions.includes('fashion.cashbox');

  const sp = await searchParams;
  const from = (sp.from || monthStart()).trim();
  const to = (sp.to || today()).trim();
  const category = (sp.category || '').trim();

  const supabase = await createClient();
  let q = supabase
    .from('erp_expenses')
    .select('id, expense_date, category, description, amount, payment_method, paid_from, paid_by, note, created_at')
    .gte('expense_date', from).lte('expense_date', to)
    .order('expense_date', { ascending: false }).order('created_at', { ascending: false });
  if (category) q = q.eq('category', category);
  const { data: expensesData } = await q;
  const expenses = (expensesData as FashionExpense[]) ?? [];

  const summary = summarizeExpenses(expenses as ExpenseRow[]);

  // Net cash after expenses: cash sales − cash-paid expenses over the same window.
  const { data: cashMoves } = await supabase
    .from('erp_cash_movements').select('amount').eq('kind', 'sale')
    .gte('created_at', from).lte('created_at', `${to}T23:59:59.999`);
  const cashSales = ((cashMoves as { amount: number }[]) ?? []).reduce((s, m) => s + (Number(m.amount) || 0), 0);
  const cashExpenses = expenses
    .filter((e) => (e.payment_method ?? e.paid_from) === 'cash')
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const netCash = netCashAfterExpenses(cashSales, cashExpenses);

  return (
    <div>
      <PageHeader title={t('fashion.expenses.title')} description={t('fashion.expenses.description')} />
      <ExpensesManager
        expenses={expenses}
        summary={summary}
        cashSales={cashSales}
        netCash={netCash}
        from={from}
        to={to}
        category={category}
        canCreate={canCreate}
        locale={locale}
      />
    </div>
  );
}
