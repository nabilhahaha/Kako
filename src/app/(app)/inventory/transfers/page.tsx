import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Pager } from '@/components/pager';
import type { Branch, ProductCatalog, TransferOrder, Warehouse } from '@/lib/erp/types';
import { TransfersManager } from './transfers-manager';

export interface TransferRow extends TransferOrder {
  from_warehouse: { code: string; name: string; name_ar: string | null } | null;
  to_warehouse: { code: string; name: string; name_ar: string | null } | null;
}

const PAGE_SIZE = 20;

export default async function TransfersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const q = (sp.q ?? '').trim();
  const fromIdx = (page - 1) * PAGE_SIZE;

  const supabase = await createClient();
  let listQuery = supabase
    .from('erp_transfer_orders')
    .select(
      '*, from_warehouse:erp_warehouses!erp_transfer_orders_from_warehouse_id_fkey(code, name, name_ar), to_warehouse:erp_warehouses!erp_transfer_orders_to_warehouse_id_fkey(code, name, name_ar)',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false });
  if (q) listQuery = listQuery.ilike('transfer_number', `%${q}%`);

  const [{ data: transfers, count }, { data: warehouses }, { data: products }, { data: branches }] =
    await Promise.all([
      listQuery.range(fromIdx, fromIdx + PAGE_SIZE - 1),
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
        q={q}
      />
      <Pager page={page} pageSize={PAGE_SIZE} total={count ?? 0} basePath="/inventory/transfers" query={{ q: q || undefined }} />
    </div>
  );
}
