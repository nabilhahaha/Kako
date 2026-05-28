import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { hasPermission } from '@/lib/erp/permissions';
import type { Branch, ProductCatalog, Warehouse } from '@/lib/erp/types';
import { RequestsManager, type RequestRow } from './requests-manager';

export default async function StockRequestsPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const supabase = await createClient();
  const [{ data: requests }, { data: warehouses }, { data: branches }, { data: products }] =
    await Promise.all([
      supabase
        .from('erp_stock_requests')
        .select(
          '*, from_warehouse:erp_warehouses!erp_stock_requests_from_warehouse_id_fkey(code, name, name_ar), to_warehouse:erp_warehouses!erp_stock_requests_to_warehouse_id_fkey(code, name, name_ar), lines:erp_stock_request_lines(product_id, quantity)',
        )
        .order('created_at', { ascending: false })
        .limit(80),
      supabase.from('erp_warehouses').select('*').eq('is_active', true).order('code'),
      supabase.from('erp_branches').select('*').eq('is_active', true).order('code'),
      supabase.from('erp_products_catalog').select('*').eq('is_active', true).order('name'),
    ]);

  return (
    <div>
      <PageHeader title="طلبات التحميل" description="المندوب يطلب تحميل بضاعة من المخزن إلى سيارته باعتماد أمين المخزن" />
      <RequestsManager
        requests={(requests as unknown as RequestRow[]) ?? []}
        warehouses={(warehouses as Warehouse[]) ?? []}
        branches={(branches as Branch[]) ?? []}
        products={(products as ProductCatalog[]) ?? []}
        currentUserId={ctx.userId}
        canApprove={hasPermission(ctx, 'stock_request.approve')}
        canRequest={hasPermission(ctx, 'stock_request.create')}
      />
    </div>
  );
}
