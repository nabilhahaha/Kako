import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import type { Branch, Warehouse } from '@/lib/erp/types';
import { WarehousesManager } from './warehouses-manager';

export default async function WarehousesPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const supabase = await createClient();
  const [{ data: warehouses }, { data: branches }] = await Promise.all([
    supabase.from('erp_warehouses').select('*').order('code'),
    supabase.from('erp_branches').select('*').eq('is_active', true).order('code'),
  ]);

  return (
    <div>
      <PageHeader
        title="المخازن"
        description="إدارة المخازن لكل فرع"
      />
      <WarehousesManager
        warehouses={(warehouses as Warehouse[]) ?? []}
        branches={(branches as Branch[]) ?? []}
      />
    </div>
  );
}
