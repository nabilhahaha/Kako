import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard as Stat } from '@/components/shared/stat-card';
import { GettingStarted } from '@/components/shared/getting-started';
import { buttonVariants } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';
import { WashingMachine, Wallet, Clock, PackageCheck } from 'lucide-react';
import { getT } from '@/lib/i18n/server';
import { INTL_LOCALE } from '@/lib/i18n/config';

export default async function LaundryDashboard() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t, locale } = await getT();
  if (!ctx.companyId) {
    return (<div><PageHeader title={t('laundry.dashboard.title')} /><p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">{t('laundry.noCompany')}</p></div>);
  }
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: active }, { data: closed }, { count: servicesCount }, { count: ordersTotal }] = await Promise.all([
    supabase.from('erp_laundry_orders').select('status').in('status', ['received', 'washing', 'ready']),
    supabase.from('erp_laundry_orders').select('total').eq('status', 'delivered').gte('delivered_at', `${today}T00:00:00`),
    supabase.from('erp_laundry_services').select('id', { count: 'exact', head: true }),
    supabase.from('erp_laundry_orders').select('id', { count: 'exact', head: true }),
  ]);
  const a = (active as { status: string }[]) ?? [];
  const count = (st: string) => a.filter((x) => x.status === st).length;
  const sales = ((closed as { total: number }[]) ?? []).reduce((s, o) => s + Number(o.total || 0), 0);

  return (
    <div>
      <PageHeader title={t('laundry.dashboard.title')} description={t('laundry.dashboard.description')} action={
        <Link href="/laundry/orders" className={buttonVariants({ size: 'sm' })}><WashingMachine className="h-4 w-4" /> {t('laundry.dashboard.ordersLink')}</Link>
      } />
      <GettingStarted
        storageKey="kako_gs_laundry"
        steps={[
          { label: t('laundry.dashboard.gsServices'), href: '/laundry/services', done: (servicesCount ?? 0) > 0 },
          { label: t('laundry.dashboard.gsFirstOrder'), href: '/laundry/orders', done: (ordersTotal ?? 0) > 0 },
        ]}
      />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label={t('laundry.dashboard.statSalesToday')} value={formatCurrency(sales, 'EGP', INTL_LOCALE[locale])} icon={Wallet} tone="success" />
        <Stat label={t('laundry.dashboard.statReceived')} value={String(count('received'))} icon={Clock} tone="info" href="/laundry/orders" />
        <Stat label={t('laundry.dashboard.statWashing')} value={String(count('washing'))} icon={WashingMachine} tone="warning" href="/laundry/orders" />
        <Stat label={t('laundry.dashboard.statReady')} value={String(count('ready'))} icon={PackageCheck} tone="primary" href="/laundry/orders" />
      </div>
    </div>
  );
}
