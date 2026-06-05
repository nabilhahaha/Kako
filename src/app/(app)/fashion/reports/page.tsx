import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard as Stat } from '@/components/shared/stat-card';
import { getT } from '@/lib/i18n/server';
import { requirePermission } from '@/lib/erp/guards';
import { formatCurrency } from '@/lib/utils';
import { INTL_LOCALE } from '@/lib/i18n/config';
import { Wallet, CreditCard, Truck, Users, BarChart3, AlertTriangle } from 'lucide-react';

export default async function FashionReportsPage() {
  const { t, locale } = await getT();
  await requirePermission('fashion.reports');
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.companyId) {
    return (<div><PageHeader title={t('fashion.reports.title')} /><p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">{t('fashion.common.noCompany')}</p></div>);
  }

  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + '01';
  const [
    { data: invToday }, { data: invMonth }, { data: cust }, { data: sup }, { data: due },
  ] = await Promise.all([
    supabase.from('erp_invoices').select('net_amount').gte('created_at', `${today}T00:00:00`),
    supabase.from('erp_invoices').select('net_amount, paid_amount').gte('created_at', `${monthStart}T00:00:00`),
    supabase.from('erp_customers').select('balance').neq('code', 'WALKIN'),
    supabase.from('erp_suppliers').select('balance'),
    supabase.from('erp_installment_schedule').select('amount, paid_amount').neq('status', 'paid').lte('due_date', today),
  ]);

  const salesToday = ((invToday as { net_amount: number }[]) ?? []).reduce((s, r) => s + Number(r.net_amount || 0), 0);
  const salesMonth = ((invMonth as { net_amount: number }[]) ?? []).reduce((s, r) => s + Number(r.net_amount || 0), 0);
  const receivables = ((cust as { balance: number }[]) ?? []).reduce((s, r) => s + Math.max(Number(r.balance || 0), 0), 0);
  const payables = ((sup as { balance: number }[]) ?? []).reduce((s, r) => s + Math.max(Number(r.balance || 0), 0), 0);
  const dueAmount = ((due as { amount: number; paid_amount: number }[]) ?? []).reduce((s, r) => s + Math.max(Number(r.amount || 0) - Number(r.paid_amount || 0), 0), 0);
  const money = (n: number) => formatCurrency(n, 'EGP', INTL_LOCALE[locale]);

  return (
    <div>
      <PageHeader title={t('fashion.reports.title')} description={t('fashion.reports.description')} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Stat label={t('fashion.reports.dailySales')} value={money(salesToday)} icon={Wallet} tone="success" />
        <Stat label={t('fashion.reports.profit')} value={money(salesMonth)} icon={BarChart3} tone="primary" hint={t('fashion.reports.dailySales')} />
        <Stat label={t('fashion.reports.installmentsDue')} value={money(dueAmount)} icon={CreditCard} tone="warning" href="/fashion/installments" />
        <Stat label={t('fashion.reports.customerDebt')} value={money(receivables)} icon={Users} tone="info" href="/fashion/customers" />
        <Stat label={t('fashion.reports.supplierBalance')} value={money(payables)} icon={Truck} tone="warning" href="/fashion/suppliers" />
        <Stat label={t('fashion.reports.lowStock')} value={t('fashion.reports.stock')} icon={AlertTriangle} tone="destructive" href="/fashion/inventory" />
      </div>
    </div>
  );
}
