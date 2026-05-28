import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import type { Branch, ProductCatalog, Warehouse } from '@/lib/erp/types';
import { InventoryView, type StockRow, type MovementRow } from './inventory-view';

export default async function InventoryPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const supabase = await createClient();
  const [{ data: stock }, { data: warehouses }, { data: products }, { data: branches }, { data: movements }] =
    await Promise.all([
      supabase
        .from('erp_inventory_stock')
        .select('warehouse_id, product_id, quantity, reserved_qty'),
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
      <PageHeader title="أرصدة المخزون" description="الأرصدة الحالية لكل صنف في كل مخزن وسجل الحركات" />
      <InventoryView
        stock={(stock as StockRow[]) ?? []}
        warehouses={(warehouses as Warehouse[]) ?? []}
        products={(products as ProductCatalog[]) ?? []}
        branches={(branches as Branch[]) ?? []}
        movements={(movements as unknown as MovementRow[]) ?? []}
      />
    </div>
  );
}
