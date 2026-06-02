import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import type { Area, Branch, CustomerLookup, ErpCustomer, Profile, Region } from '@/lib/erp/types';
import { CustomersManager } from './customers-manager';
import { getActiveCustomFields } from '@/lib/erp/custom-fields-server';
import { loadGovernanceInputs } from '@/lib/erp/field-governance-server';
import { resolveLayout, type GovInputs } from '@/lib/erp/field-governance';
import { getT } from '@/lib/i18n/server';

export default async function CustomersPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const { t } = await getT();

  const supabase = await createClient();
  // M3 (pilot scale guard): cap the unbounded load + per-row governance redaction
  // until S1 server pagination lands. `count` is the true total; we fetch at most
  // CAP rows and tell the UI when the list is truncated.
  const CAP = 2000;
  const [{ data: customers, count: customerCount }, { data: branches }, { data: profiles }, { data: lookups }, { data: regions }, { data: areas }] = await Promise.all([
    supabase.from('erp_customers').select('*', { count: 'exact' }).order('code').limit(CAP),
    supabase.from('erp_branches').select('*').eq('is_active', true).order('code'),
    supabase.from('erp_profiles').select('id, full_name, email').eq('is_active', true),
    supabase.from('erp_customer_lookups').select('*').eq('is_active', true).order('sort').order('name'),
    supabase.from('erp_regions').select('*').eq('is_active', true).order('sort').order('name'),
    supabase.from('erp_areas').select('*').eq('is_active', true).order('sort').order('name'),
  ]);
  const totalCustomers = customerCount ?? ((customers as ErpCustomer[]) ?? []).length;
  const truncated = totalCustomers > CAP;
  const customFields = await getActiveCustomFields('customer');

  // DFG-3: governance inputs for the form + read redaction. Hidden fields are
  // nulled out of the rows sent to the client (per-record, role + condition).
  const gov: GovInputs = await loadGovernanceInputs(supabase, ctx, 'customer');
  const rows = ((customers as ErpCustomer[]) ?? []).map((c) => {
    if (gov.fields.length === 0) return c;
    const layout = resolveLayout(gov, c as unknown as Record<string, unknown>);
    const o = { ...c } as Record<string, unknown>;
    for (const [k, a] of layout) if (a === 'hidden') o[k] = null;
    return o as unknown as ErpCustomer;
  });

  return (
    <div>
      <PageHeader
        title={t('customers.pageTitle')}
        description={t('customers.pageDescription')}
      />
      <CustomersManager
        customers={rows}
        branches={(branches as Branch[]) ?? []}
        reps={(profiles as Pick<Profile, 'id' | 'full_name' | 'email'>[]) ?? []}
        lookups={(lookups as CustomerLookup[]) ?? []}
        regions={(regions as Region[]) ?? []}
        areas={(areas as Area[]) ?? []}
        canApprove={hasPermission(ctx, 'customers.approve')}
        customFields={customFields}
        gov={gov}
        truncated={truncated}
        totalCount={totalCustomers}
      />
    </div>
  );
}
