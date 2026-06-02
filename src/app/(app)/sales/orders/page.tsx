import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Pager } from '@/components/pager';
import type { Branch, ErpCustomer, ProductCatalog, SalesOrder } from '@/lib/erp/types';
import { OrdersManager } from './orders-manager';
import { getT } from '@/lib/i18n/server';

export interface OrderRow extends SalesOrder {
  customer: { name: string; name_ar: string | null } | null;
}

const PAGE_SIZE = 20;

export default async function SalesOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t } = await getT();

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const q = (sp.q ?? '').trim();
  const fromIdx = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();
  let listQuery = supabase
    .from('erp_sales_orders')
    .select('*, customer:erp_customers(name, name_ar)', { count: 'exact' })
    .order('created_at', { ascending: false });
  if (q) listQuery = listQuery.ilike('order_number', `%${q}%`);

  const [{ data: orders, count }, { data: customers }, { data: branches }, { data: products }] =
    await Promise.all([
      listQuery.range(fromIdx, fromIdx + PAGE_SIZE - 1),
      supabase.from('erp_customers').select('*').eq('is_active', true).order('name'),
      supabase.from('erp_branches').select('*').eq('is_active', true).order('code'),
      supabase
        .from('erp_products_catalog')
        .select('*')
        .eq('is_active', true)
        .order('name'),
    ]);

  return (
    <div>
      <PageHeader title={t('sales.ordersTitle')} description={t('sales.ordersDescription')} />
      <OrdersManager
        orders={(orders as OrderRow[]) ?? []}
        customers={(customers as ErpCustomer[]) ?? []}
        branches={(branches as Branch[]) ?? []}
        products={(products as ProductCatalog[]) ?? []}
        q={q}
      />
      <Pager page={page} pageSize={PAGE_SIZE} total={count ?? 0} basePath="/sales/orders" query={{ q: q || undefined }} />
    </div>
  );
}
