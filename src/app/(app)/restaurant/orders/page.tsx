import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import { OrdersList, type OpenOrder } from './orders-list';

export default async function OrdersPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t } = await getT();
  if (!ctx.companyId) {
    return (
      <div>
        <PageHeader title={t('restaurant.orders.titleNoCompany')} />
        <p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">{t('restaurant.noCompany')}</p>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: orders } = await supabase
    .from('erp_restaurant_orders')
    .select('id, order_type, status, customer_name, delivery_fee, created_at, table:erp_restaurant_tables(name), items:erp_restaurant_order_items(qty, price)')
    .eq('status', 'open')
    .order('created_at', { ascending: true });

  const list: OpenOrder[] = ((orders as unknown as Array<{
    id: string; order_type: string; status: string; customer_name: string | null; delivery_fee: number; created_at: string;
    table: { name: string } | null; items: { qty: number; price: number }[] | null;
  }>) ?? []).map((o) => ({
    id: o.id,
    order_type: o.order_type,
    customer_name: o.customer_name,
    table_name: o.table?.name ?? null,
    total: (o.items ?? []).reduce((s, it) => s + Number(it.qty) * Number(it.price), 0) + Number(o.delivery_fee || 0),
    item_count: (o.items ?? []).length,
  }));

  return (
    <div>
      <PageHeader title={t('restaurant.orders.title')} description={t('restaurant.orders.description')} />
      <OrdersList orders={list} />
    </div>
  );
}
