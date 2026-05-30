import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import type { Branch, Supplier } from '@/lib/erp/types';
import { SuppliersManager } from './suppliers-manager';
import { getT } from '@/lib/i18n/server';

export default async function SuppliersPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const { t } = await getT();

  const supabase = await createClient();
  const [{ data: suppliers }, { data: branches }] = await Promise.all([
    supabase.from('erp_suppliers').select('*').order('code'),
    supabase.from('erp_branches').select('*').eq('is_active', true).order('code'),
  ]);

  return (
    <div>
      <PageHeader
        title={t('suppliers.pageTitle')}
        description={t('suppliers.pageDescription')}
      />
      <SuppliersManager
        suppliers={(suppliers as Supplier[]) ?? []}
        branches={(branches as Branch[]) ?? []}
      />
    </div>
  );
}
