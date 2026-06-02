import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import type { Branch, ProductCatalog, Warehouse } from '@/lib/erp/types';
import { parseListParams, buildOrIlike } from '@/lib/erp/list-query';
import { InventoryView, type StockRow, type MovementRow } from './inventory-view';

const LEVELS_PAGE_SIZE = 50;
const NO_MATCH = '00000000-0000-0000-0000-000000000000';

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; warehouse?: string }>;
}) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const { t } = await getT();
  const sp = await searchParams;
  const { page, q, pageSize, from, to } = parseListParams(sp, LEVELS_PAGE_SIZE);
  const warehouse = sp.warehouse ?? '';

  const supabase = await createClient();

  // S1: stock-level search resolves matching product ids first, then filters the
  // (paginated) stock table by them — avoids an unbounded join/scan on levels.
  let productIds: string[] | null = null;
  if (q) {
    const orExpr = buildOrIlike(q, ['code', 'name', 'name_ar']);
    const { data: matched } = await supabase
      .from('erp_products_catalog').select('id').or(orExpr ?? 'code.ilike.%%').limit(500);
    productIds = (matched ?? []).map((m) => (m as { id: string }).id);
    if (productIds.length === 0) productIds = [NO_MATCH];
  }

  let stockQuery = supabase
    .from('erp_inventory_stock')
    .select('warehouse_id, product_id, quantity, reserved_qty', { count: 'exact' })
    .order('product_id');
  if (warehouse) stockQuery = stockQuery.eq('warehouse_id', warehouse);
  if (productIds) stockQuery = stockQuery.in('product_id', productIds);

  const [{ data: stock, count }, { data: warehouses }, { data: products }, { data: branches }, { data: movements }] =
    await Promise.all([
      stockQuery.range(from, to),
      supabase.from('erp_warehouses').select('*').eq('is_active', true).order('code'),
      supabase.from('erp_products_catalog').select('*').eq('is_active', true).order('name'),
      supabase.from('erp_branches').select('*').eq('is_active', true).order('code'),
      supabase
        .from('erp_stock_movements')
        .select('*, product:erp_products_catalog(name, name_ar), warehouse:erp_warehouses(code, name, name_ar)')
        .order('created_at', { ascending: false })
        .limit(100),
    ]);

  return (
    <div>
      <PageHeader title={t('inventory.pageTitle')} description={t('inventory.pageDescription')} />
      <InventoryView
        stock={(stock as StockRow[]) ?? []}
        warehouses={(warehouses as Warehouse[]) ?? []}
        products={(products as ProductCatalog[]) ?? []}
        branches={(branches as Branch[]) ?? []}
        movements={(movements as unknown as MovementRow[]) ?? []}
        q={q}
        warehouse={warehouse}
        page={page}
        pageSize={pageSize}
        total={count ?? 0}
      />
    </div>
  );
}
