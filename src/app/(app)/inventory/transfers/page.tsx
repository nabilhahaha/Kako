import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import type { Branch, ProductCatalog, TransferOrder, Warehouse } from '@/lib/erp/types';
import { TransfersManager } from './transfers-manager';

export interface TransferRow extends TransferOrder {
  from_warehouse: { code: string; name: string; name_ar: string | null } | null;
  to_warehouse: { code: string; name: string; name_ar: string | null } | null;
}

export default async function TransfersPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const supabase = await createClient();
  const [{ data: transfers }, { data: warehouses }, { data: products }, { data: branches }] =
    await Promise.all([
      supabase
        .from('erp_transfer_orders')
        .select(
          '*, from_warehouse:erp_warehouses!erp_transfer_orders_from_warehouse_id_fkey(code, name, name_ar), to_warehouse:erp_warehouses!erp_transfer_orders_to_warehouse_id_fkey(code, name, name_ar)',
        )
        .order('created_at', { ascending: false }),
      supabase.from('erp_warehouses').select('*').eq('is_active', true).order('code'),
      supabase.from('erp_products_catalog').select('*').eq('is_active', true).order('name'),
      supabase.from('erp_branches').select('*').eq('is_active', true).order('code'),
    ]);

  return (
    <div>
      <PageHeader title="التحويلات بين المخازن" description="نقل المخزون من مخزن لآخر" />
      <TransfersManager
        transfers={(transfers as unknown as TransferRow[]) ?? []}
        warehouses={(warehouses as Warehouse[]) ?? []}
        products={(products as ProductCatalog[]) ?? []}
        branches={(branches as Branch[]) ?? []}
      />
    </div>
  );
}
