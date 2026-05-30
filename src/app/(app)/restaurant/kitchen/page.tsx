import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import { KitchenBoard, type KitchenOrder } from './kitchen-board';

export default async function KitchenPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t } = await getT();
  if (!ctx.companyId) {
    return (
      <div>
        <PageHeader title={t('restaurant.kitchen.titleNoCompany')} />
        <p className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">{t('restaurant.noCompany')}</p>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: rows } = await supabase
    .from('erp_restaurant_order_items')
    .select('id, name, qty, notes, kitchen_status, created_at, order:erp_restaurant_orders(id, order_type, status, customer_name, table:erp_restaurant_tables(name))')
    .in('kitchen_status', ['new', 'preparing'])
    .order('created_at', { ascending: true });

  type Row = {
    id: string; name: string; qty: number; notes: string | null; kitchen_status: string;
    order: { id: string; order_type: string; status: string; customer_name: string | null; table: { name: string } | null } | null;
  };
  const byOrder = new Map<string, KitchenOrder>();
  for (const r of (rows as unknown as Row[]) ?? []) {
    if (!r.order || r.order.status !== 'open') continue;
    const oid = r.order.id;
    if (!byOrder.has(oid)) {
      byOrder.set(oid, {
        id: oid,
        label: r.order.table?.name
          ? t('restaurant.kitchen.tableLabel', { name: r.order.table.name })
          : (r.order.customer_name || t(`restaurant.orderType.${r.order.order_type}`)),
        order_type: r.order.order_type,
        items: [],
      });
    }
    byOrder.get(oid)!.items.push({ id: r.id, name: r.name, qty: r.qty, notes: r.notes, kitchen_status: r.kitchen_status });
  }

  return (
    <div>
      <PageHeader title={t('restaurant.kitchen.title')} description={t('restaurant.kitchen.description')} />
      <KitchenBoard orders={[...byOrder.values()]} />
    </div>
  );
}
