import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { VanTransferForm } from './van-transfer-form';

/**
 * Van Transfer REQUEST screen — exposes the existing requestVanTransfer action
 * (no new backend). The created erp_van_transfers row is pending and surfaces in
 * the unified Approval Queue for a supervisor (stock.transfer.approve).
 */
export const dynamic = 'force-dynamic';

export default async function VanTransferPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!hasPermission(ctx, 'stock.transfer')) redirect('/inventory');

  const supabase = await createClient();
  const [{ data: warehouses }, { data: products }] = await Promise.all([
    supabase.from('erp_warehouses').select('id, name, name_ar').order('name').limit(300),
    supabase.from('erp_products_catalog').select('id, name, name_ar, code').eq('is_active', true).order('name').limit(1000),
  ]);

  return (
    <VanTransferForm
      warehouses={(warehouses ?? []) as Array<{ id: string; name: string; name_ar: string | null }>}
      products={(products ?? []) as Array<{ id: string; name: string; name_ar: string | null; code: string | null }>}
    />
  );
}
