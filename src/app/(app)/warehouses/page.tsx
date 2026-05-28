import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import type { Branch, Profile, Warehouse } from '@/lib/erp/types';
import { WarehousesManager } from './warehouses-manager';

export default async function WarehousesPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const supabase = await createClient();
  const [{ data: warehouses }, { data: branches }, { data: profiles }] = await Promise.all([
    supabase.from('erp_warehouses').select('*').order('code'),
    supabase.from('erp_branches').select('*').eq('is_active', true).order('code'),
    supabase.from('erp_profiles').select('id, full_name, email').eq('is_active', true),
  ]);

  return (
    <div>
      <PageHeader
        title="المخازن"
        description="إدارة المخازن والسيارات لكل فرع"
      />
      <WarehousesManager
        warehouses={(warehouses as Warehouse[]) ?? []}
        branches={(branches as Branch[]) ?? []}
        profiles={(profiles as Pick<Profile, 'id' | 'full_name' | 'email'>[]) ?? []}
      />
    </div>
  );
}
