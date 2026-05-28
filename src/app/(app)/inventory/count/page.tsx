import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import type { Warehouse } from '@/lib/erp/types';
import { StockCountManager, type CountRow, type CountLineRow } from './stock-count-manager';

export default async function StockCountPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const sp = await searchParams;

  const supabase = await createClient();
  const [{ data: warehouses }, { data: counts }] = await Promise.all([
    supabase.from('erp_warehouses').select('*').eq('is_active', true).order('code'),
    supabase
      .from('erp_stock_counts')
      .select('*, warehouse:erp_warehouses(code, name, name_ar)')
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  let activeLines: CountLineRow[] = [];
  let activeCount: CountRow | null = null;
  if (sp.id) {
    const { data: c } = await supabase
      .from('erp_stock_counts')
      .select('*, warehouse:erp_warehouses(code, name, name_ar)')
      .eq('id', sp.id)
      .maybeSingle();
    activeCount = (c as CountRow) ?? null;
    if (activeCount) {
      const { data: lines } = await supabase
        .from('erp_stock_count_lines')
        .select('*, product:erp_products_catalog(code, name, name_ar)')
        .eq('count_id', sp.id);
      activeLines = (lines as unknown as CountLineRow[]) ?? [];
    }
  }

  return (
    <div>
      <PageHeader title="الجرد" description="جرد المخازن والسيارات وكشف العجز/الزيادة وتسويته" />
      <StockCountManager
        warehouses={(warehouses as Warehouse[]) ?? []}
        counts={(counts as unknown as CountRow[]) ?? []}
        activeCount={activeCount}
        activeLines={activeLines}
      />
    </div>
  );
}
