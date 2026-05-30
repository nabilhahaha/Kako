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
import { UtensilsCrossed, LayoutGrid, ChefHat, Wallet, Receipt, Printer } from 'lucide-react';

export default async function RestaurantDashboard() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t } = await getT();
  if (!ctx.companyId) {
    return (
      <div>
        <PageHeader title={t('restaurant.dashboard.titleNoCompany')} />
        <p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">{t('restaurant.noCompany')}</p>
      </div>
    );
  }

  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const [
    { data: closed }, { data: openOrders }, { data: tables }, { data: kitchenItems },
    { count: menuCount }, { count: ordersTotal },
  ] = await Promise.all([
    supabase.from('erp_restaurant_orders').select('total').eq('status', 'closed').gte('closed_at', `${today}T00:00:00`),
    supabase.from('erp_restaurant_orders').select('id').eq('status', 'open'),
    supabase.from('erp_restaurant_tables').select('status').eq('is_active', true),
    supabase.from('erp_restaurant_order_items').select('id').in('kitchen_status', ['new', 'preparing']),
    supabase.from('erp_products_catalog').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('erp_restaurant_orders').select('id', { count: 'exact', head: true }),
  ]);

  const sales = ((closed as { total: number }[]) ?? []).reduce((s, o) => s + Number(o.total || 0), 0);
  const openCount = ((openOrders as unknown[]) ?? []).length;
  const occupied = ((tables as { status: string }[]) ?? []).filter((t) => t.status === 'occupied').length;
  const tablesTotal = ((tables as unknown[]) ?? []).length;
  const kitchenCount = ((kitchenItems as unknown[]) ?? []).length;

  return (
    <div>
      <PageHeader title={t('restaurant.dashboard.title')} description={t('restaurant.dashboard.description')} action={
        <div className="flex gap-2">
          <Link href="/restaurant/orders" className={buttonVariants({ size: 'sm' })}><UtensilsCrossed className="h-4 w-4" /> {t('restaurant.dashboard.btnOrders')}</Link>
          <Link href="/print/restaurant/day-closing" target="_blank" className={buttonVariants({ size: 'sm', variant: 'outline' })}><Printer className="h-4 w-4" /> {t('restaurant.dashboard.btnDayClosing')}</Link>
        </div>
      } />
      <GettingStarted
        storageKey="kako_gs_restaurant"
        steps={[
          { label: t('restaurant.dashboard.gsMenuItems'), href: '/products', done: (menuCount ?? 0) > 0 },
          { label: t('restaurant.dashboard.gsTables'), href: '/restaurant/tables', done: tablesTotal > 0 },
          { label: t('restaurant.dashboard.gsFirstOrder'), href: '/restaurant/orders', done: (ordersTotal ?? 0) > 0 },
        ]}
      />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label={t('restaurant.dashboard.statSales')} value={formatCurrency(sales)} icon={Wallet} tone="success" />
        <Stat label={t('restaurant.dashboard.statOpenOrders')} value={String(openCount)} icon={Receipt} tone="info" href="/restaurant/orders" />
        <Stat label={t('restaurant.dashboard.statOccupiedTables')} value={`${occupied} / ${tablesTotal}`} icon={LayoutGrid} tone="warning" href="/restaurant/tables" />
        <Stat label={t('restaurant.dashboard.statKitchenItems')} value={String(kitchenCount)} icon={ChefHat} tone="primary" href="/restaurant/kitchen" />
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        <Link href="/restaurant/tables" className={buttonVariants({ variant: 'outline' })}><LayoutGrid className="h-4 w-4" /> {t('restaurant.dashboard.btnTables')}</Link>
        <Link href="/restaurant/kitchen" className={buttonVariants({ variant: 'outline' })}><ChefHat className="h-4 w-4" /> {t('restaurant.dashboard.btnKitchen')}</Link>
      </div>
    </div>
  );
}
