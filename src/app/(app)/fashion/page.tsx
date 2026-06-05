import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard as Stat } from '@/components/shared/stat-card';
import { GettingStarted } from '@/components/shared/getting-started';
import { buttonVariants } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';
import { getT } from '@/lib/i18n/server';
import { INTL_LOCALE } from '@/lib/i18n/config';
import { ScanBarcode, Wallet, CreditCard, Layers, Users, AlertTriangle } from 'lucide-react';

export default async function FashionDashboard() {
  const { t, locale } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.companyId) {
    return (
      <div>
        <PageHeader title={t('fashion.dashboard.title')} />
        <p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">{t('fashion.common.noCompany')}</p>
      </div>
    );
  }

  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const [
    { data: invToday }, { data: payToday }, { data: dueToday },
    { count: variantCount }, { count: customerCount },
  ] = await Promise.all([
    supabase.from('erp_invoices').select('net_amount').gte('created_at', `${today}T00:00:00`),
    supabase.from('erp_payments').select('amount').eq('payment_date', today),
    supabase.from('erp_installment_schedule').select('amount, paid_amount').eq('due_date', today).neq('status', 'paid'),
    supabase.from('erp_fashion_variants').select('id', { count: 'exact', head: true }),
    supabase.from('erp_customers').select('id', { count: 'exact', head: true }).neq('code', 'WALKIN'),
  ]);

  const sales = ((invToday as { net_amount: number }[]) ?? []).reduce((s, r) => s + Number(r.net_amount || 0), 0);
  const cash = ((payToday as { amount: number }[]) ?? []).reduce((s, r) => s + Number(r.amount || 0), 0);
  const dueRows = (dueToday as { amount: number; paid_amount: number }[]) ?? [];
  const dueAmount = dueRows.reduce((s, r) => s + Math.max(Number(r.amount || 0) - Number(r.paid_amount || 0), 0), 0);
  const money = (n: number) => formatCurrency(n, 'EGP', INTL_LOCALE[locale]);

  return (
    <div>
      <PageHeader
        title={t('fashion.dashboard.title')}
        description={t('fashion.dashboard.description')}
        action={
          <Link href="/fashion/sell" className={buttonVariants({ size: 'sm' })}>
            <ScanBarcode className="h-4 w-4" /> {t('fashion.dashboard.newSale')}
          </Link>
        }
      />
      <GettingStarted
        storageKey="kako_gs_fashion"
        steps={[
          { label: t('fashion.dashboard.gsMasterData'), href: '/fashion/products', done: (variantCount ?? 0) > 0 },
          { label: t('fashion.dashboard.gsFirstProduct'), href: '/fashion/products', done: (variantCount ?? 0) > 0 },
          { label: t('fashion.dashboard.gsFirstSale'), href: '/fashion/sell', done: sales > 0 },
        ]}
      />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label={t('fashion.dashboard.statSalesToday')} value={money(sales)} icon={Wallet} tone="success" />
        <Stat label={t('fashion.dashboard.statCashToday')} value={money(cash)} icon={Wallet} tone="info" href="/fashion/cashbox" />
        <Stat label={t('fashion.dashboard.statDueToday')} value={money(dueAmount)} icon={CreditCard} tone="warning" href="/fashion/installments" />
        <Stat label={t('fashion.dashboard.statVariants')} value={String(variantCount ?? 0)} icon={Layers} tone="primary" href="/fashion/products" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label={t('fashion.dashboard.statCustomers')} value={String(customerCount ?? 0)} icon={Users} tone="primary" href="/fashion/customers" />
        <Stat label={t('fashion.dashboard.statDueToday')} value={String(dueRows.length)} icon={AlertTriangle} tone="warning" href="/fashion/installments" />
      </div>
    </div>
  );
}
