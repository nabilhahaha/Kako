import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import type { Branch, ErpCustomer } from '@/lib/erp/types';
import { CustomersManager } from './customers-manager';

export default async function CustomersPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const supabase = await createClient();
  const [{ data: customers }, { data: branches }] = await Promise.all([
    supabase.from('erp_customers').select('*').order('code'),
    supabase.from('erp_branches').select('*').eq('is_active', true).order('code'),
  ]);

  return (
    <div>
      <PageHeader
        title="العملاء"
        description="قاعدة بيانات العملاء وحدود الائتمان والأرصدة"
      />
      <CustomersManager
        customers={(customers as ErpCustomer[]) ?? []}
        branches={(branches as Branch[]) ?? []}
      />
    </div>
  );
}
