import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import type { Supplier } from '@/lib/erp/types';
import { SuppliersManager } from './suppliers-manager';

export default async function SuppliersPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const supabase = await createClient();
  const { data: suppliers } = await supabase
    .from('erp_suppliers')
    .select('*')
    .order('code');

  return (
    <div>
      <PageHeader
        title="الموردين"
        description="بيانات الموردين وأرصدتهم المستحقة"
      />
      <SuppliersManager suppliers={(suppliers as Supplier[]) ?? []} />
    </div>
  );
}
