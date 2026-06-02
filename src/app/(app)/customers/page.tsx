import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import type { Area, Branch, CustomerLookup, ErpCustomer, Profile, Region } from '@/lib/erp/types';
import { CustomersManager } from './customers-manager';
import { getActiveCustomFields } from '@/lib/erp/custom-fields-server';
import { getT } from '@/lib/i18n/server';

export default async function CustomersPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const { t } = await getT();

  const supabase = await createClient();
  const [{ data: customers }, { data: branches }, { data: profiles }, { data: lookups }, { data: regions }, { data: areas }] = await Promise.all([
    supabase.from('erp_customers').select('*').order('code'),
    supabase.from('erp_branches').select('*').eq('is_active', true).order('code'),
    supabase.from('erp_profiles').select('id, full_name, email').eq('is_active', true),
    supabase.from('erp_customer_lookups').select('*').eq('is_active', true).order('sort').order('name'),
    supabase.from('erp_regions').select('*').eq('is_active', true).order('sort').order('name'),
    supabase.from('erp_areas').select('*').eq('is_active', true).order('sort').order('name'),
  ]);
  const customFields = await getActiveCustomFields('customer');

  return (
    <div>
      <PageHeader
        title={t('customers.pageTitle')}
        description={t('customers.pageDescription')}
      />
      <CustomersManager
        customers={(customers as ErpCustomer[]) ?? []}
        branches={(branches as Branch[]) ?? []}
        reps={(profiles as Pick<Profile, 'id' | 'full_name' | 'email'>[]) ?? []}
        lookups={(lookups as CustomerLookup[]) ?? []}
        regions={(regions as Region[]) ?? []}
        areas={(areas as Area[]) ?? []}
        isSuperAdmin={ctx.isSuperAdmin}
        customFields={customFields}
      />
    </div>
  );
}
