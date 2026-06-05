import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import type { Warehouse } from '@/lib/erp/types';
import { AdjustmentsManager, type AdjustmentRow, type ProductOption } from './adjustments-manager';

export default async function StockAdjustmentsPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t } = await getT();

  const supabase = await createClient();
  const [{ data: warehouses }, { data: products }, { data: adjustments }] = await Promise.all([
    supabase.from('erp_warehouses').select('*').eq('is_active', true).order('code'),
    supabase
      .from('erp_products_catalog')
      .select('id, code, name, name_ar, cost_price')
      .eq('is_active', true)
      .order('name')
      .limit(2000),
    supabase
      .from('erp_stock_adjustments')
      .select('*, product:erp_products_catalog(code, name, name_ar), warehouse:erp_warehouses(code, name, name_ar)')
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  return (
    <div>
      <PageHeader title={t('ops.adjTitle')} description={t('ops.adjDescription')} />
      <AdjustmentsManager
        warehouses={(warehouses as Warehouse[]) ?? []}
        products={(products as ProductOption[]) ?? []}
        adjustments={(adjustments as unknown as AdjustmentRow[]) ?? []}
      />
    </div>
  );
}
