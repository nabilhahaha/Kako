import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Pager } from '@/components/pager';
import type { Area, Branch, CustomerLookup, ErpCustomer, Profile, Region } from '@/lib/erp/types';
import { CustomersManager } from './customers-manager';
import { getActiveCustomFields } from '@/lib/erp/custom-fields-server';
import { loadGovernanceInputs } from '@/lib/erp/field-governance-server';
import { resolveLayout, type GovInputs } from '@/lib/erp/field-governance';
import { parseListParams, applySearch } from '@/lib/erp/list-query';
import { getT } from '@/lib/i18n/server';

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; segment?: string; classification?: string; channel?: string }>;
}) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const { t } = await getT();
  const sp = await searchParams;
  const { page, q, pageSize, from, to } = parseListParams(sp);
  const segment = sp.segment ?? '';
  const classification = sp.classification ?? '';
  const channel = sp.channel ?? '';

  const supabase = await createClient();
  // S1: server pagination + search + filters (the standard list pattern).
  let listQuery = supabase.from('erp_customers').select('*', { count: 'estimated' }).order('code');
  listQuery = applySearch(listQuery, q, ['code', 'name', 'name_ar', 'phone']);
  if (segment) listQuery = listQuery.eq('segment_id', segment);
  if (classification) listQuery = listQuery.eq('classification_id', classification);
  if (channel) listQuery = listQuery.eq('channel_id', channel);

  const [{ data: customers, count }, { data: branches }, { data: profiles }, { data: lookups }, { data: regions }, { data: areas }] = await Promise.all([
    listQuery.range(from, to),
    supabase.from('erp_branches').select('*').eq('is_active', true).order('code'),
    supabase.from('erp_profiles').select('id, full_name, email').eq('is_active', true),
    supabase.from('erp_customer_lookups').select('*').eq('is_active', true).order('sort').order('name'),
    supabase.from('erp_regions').select('*').eq('is_active', true).order('sort').order('name'),
    supabase.from('erp_areas').select('*').eq('is_active', true).order('sort').order('name'),
  ]);
  const customFields = await getActiveCustomFields('customer');

  // DFG-3 + S2: governance read redaction applied to the CURRENT PAGE only
  // (≤ pageSize rows) — hidden fields nulled out before reaching the client.
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
        q={q}
        filterSegment={segment}
        filterClassification={classification}
        filterChannel={channel}
      />
      <Pager
        page={page}
        pageSize={pageSize}
        total={count ?? 0}
        basePath="/customers"
        query={{ q: q || undefined, segment: segment || undefined, classification: classification || undefined, channel: channel || undefined }}
      />
    </div>
  );
}
