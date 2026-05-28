import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import type { Branch, ProductCatalog, PurchaseOrder, Supplier, Warehouse } from '@/lib/erp/types';
import { PurchasesManager } from './purchases-manager';

export interface POLineLite {
  product_id: string;
  quantity: number;
}
export interface PORow extends PurchaseOrder {
  supplier: { name: string; name_ar: string | null } | null;
  lines: POLineLite[];
}

export default async function PurchaseOrdersPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const supabase = await createClient();
  const [{ data: orders }, { data: suppliers }, { data: branches }, { data: products }, { data: warehouses }] =
    await Promise.all([
      supabase
        .from('erp_purchase_orders')
        .select('*, supplier:erp_suppliers(name, name_ar), lines:erp_purchase_order_lines(product_id, quantity)')
        .order('created_at', { ascending: false }),
      supabase.from('erp_suppliers').select('*').eq('is_active', true).order('name'),
      supabase.from('erp_branches').select('*').eq('is_active', true).order('code'),
      supabase.from('erp_products_catalog').select('*').eq('is_active', true).order('name'),
      supabase.from('erp_warehouses').select('*').eq('is_active', true).order('code'),
    ]);

  return (
    <div>
      <PageHeader title="أوامر الشراء" description="طلبات الشراء واستلام البضاعة في المخزن" />
      <PurchasesManager
        orders={(orders as unknown as PORow[]) ?? []}
        suppliers={(suppliers as Supplier[]) ?? []}
        branches={(branches as Branch[]) ?? []}
        products={(products as ProductCatalog[]) ?? []}
        warehouses={(warehouses as Warehouse[]) ?? []}
      />
    </div>
  );
}
