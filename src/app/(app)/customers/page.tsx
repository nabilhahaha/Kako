import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import type { Branch, ErpCustomer, Profile } from '@/lib/erp/types';
import { CustomersManager } from './customers-manager';

export default async function CustomersPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const supabase = await createClient();
  const [{ data: customers }, { data: branches }, { data: profiles }] = await Promise.all([
    supabase.from('erp_customers').select('*').order('code'),
    supabase.from('erp_branches').select('*').eq('is_active', true).order('code'),
    supabase.from('erp_profiles').select('id, full_name, email').eq('is_active', true),
  ]);

  return (
    <div>
      <PageHeader
        title="العملاء"
        description="قاعدة بيانات العملاء وحدود الائتمان والأرصدة وخطة الزيارات"
      />
      <CustomersManager
        customers={(customers as ErpCustomer[]) ?? []}
        branches={(branches as Branch[]) ?? []}
        reps={(profiles as Pick<Profile, 'id' | 'full_name' | 'email'>[]) ?? []}
        isSuperAdmin={ctx.isSuperAdmin}
      />
    </div>
  );
}
