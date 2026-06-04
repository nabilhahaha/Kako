import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import type { Branch, ErpCustomer, ProductCatalog } from '@/lib/erp/types';
import { PosTerminal } from './pos-terminal';
import { getT } from '@/lib/i18n/server';

export default async function PosPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t } = await getT();

  const supabase = await createClient();
  const [{ data: customers }, { data: branches }, { data: products }] = await Promise.all([
    supabase.from('erp_customers').select('*').eq('is_active', true).order('name'),
    supabase.from('erp_branches').select('*').eq('is_active', true).order('code'),
    supabase.from('erp_products_catalog').select('*').eq('is_active', true).order('name'),
  ]);

  return (
    <div>
      <PageHeader title={t('sales.posTitle')} description={t('sales.posDescription')} />
      <PosTerminal
        customers={(customers as ErpCustomer[]) ?? []}
        branches={(branches as Branch[]) ?? []}
        products={(products as ProductCatalog[]) ?? []}
      />
    </div>
  );
}
