import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import type { Area, Branch, CustomerLookup, ErpCustomer, Profile, Region } from '@/lib/erp/types';
import { CustomersWorkbench } from './customers-workbench';
import { getActiveCustomFields } from '@/lib/erp/custom-fields-server';
import { loadGovernanceInputs } from '@/lib/erp/field-governance-server';
import { resolveLayout, type GovInputs } from '@/lib/erp/field-governance';
import { parseListParams, applySearch } from '@/lib/erp/list-query';
import { getT } from '@/lib/i18n/server';

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; segment?: string; classification?: string; channel?: string; id?: string }>;
}) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const { t } = await getT();
  const sp = await searchParams;
  const { page, q, pageSize, from, to } = parseListParams(sp);
  const segment = sp.segment ?? '';
  const classification = sp.classification ?? '';
  const channel = sp.channel ?? '';
  const selectedId = sp.id ?? '';

  const supabase = await createClient();
  // S1: server pagination + search + filters (the standard list pattern).
  let listQuery = supabase.from('erp_customers').select('*', { count: 'estimated' }).order('code');
  listQuery = applySearch(listQuery, q, ['code', 'name', 'name_ar', 'phone']);
  if (segment) listQuery = listQuery.eq('segment_id', segment);
  if (classification) listQuery = listQuery.eq('classification_id', classification);
  if (channel) listQuery = listQuery.eq('channel_id', channel);

  const [{ data: customers, count }, { data: branches }, { data: profiles }, { data: lookups }, { data: regions }, { data: areas }, { data: routes }, selRes] = await Promise.all([
    listQuery.range(from, to),
    supabase.from('erp_branches').select('*').eq('is_active', true).order('code'),
    // Role-scoped reps (self/team/region/all) — see erp_assignable_reps / RLS.
    supabase.rpc('erp_assignable_reps'),
    supabase.from('erp_customer_lookups').select('*').eq('is_active', true).order('sort').order('name'),
    supabase.from('erp_regions').select('*').eq('is_active', true).order('sort').order('name'),
    supabase.from('erp_areas').select('*').eq('is_active', true).order('sort').order('name'),
    // G1: read-only territory display (route name).
    supabase.from('erp_routes').select('id, name, name_ar').eq('is_active', true).order('name'),
    // Deep-link: load the selected record directly so it resolves regardless of
    // the current search/filter/pagination window.
    selectedId
      ? supabase.from('erp_customers').select('*').eq('id', selectedId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const customFields = await getActiveCustomFields('customer');

  // DFG-3 + S2: governance read redaction (hidden fields nulled before reaching
  // the client) applied to the current page AND the deep-linked record.
  const gov: GovInputs = await loadGovernanceInputs(supabase, ctx, 'customer');
  const redact = (c: ErpCustomer): ErpCustomer => {
    if (gov.fields.length === 0) return c;
    const layout = resolveLayout(gov, c as unknown as Record<string, unknown>);
    const o = { ...c } as Record<string, unknown>;
    for (const [k, a] of layout) if (a === 'hidden') o[k] = null;
    return o as unknown as ErpCustomer;
  };
  const rows = ((customers as ErpCustomer[]) ?? []).map(redact);
  const selRow = (selRes as { data: ErpCustomer | null }).data;
  const selectedCustomer = selRow ? redact(selRow) : null;

  return (
    <div>
      <PageHeader
        title={t('customers.pageTitle')}
        description={t('customers.pageDescription')}
      />
      <CustomersWorkbench
        customers={rows}
        selectedCustomer={selectedCustomer}
        branches={(branches as Branch[]) ?? []}
        reps={(profiles as Pick<Profile, 'id' | 'full_name' | 'email'>[]) ?? []}
        lookups={(lookups as CustomerLookup[]) ?? []}
        regions={(regions as Region[]) ?? []}
        areas={(areas as Area[]) ?? []}
        routes={(routes as { id: string; name: string; name_ar: string | null }[]) ?? []}
        customFields={customFields}
        gov={gov}
        canApprove={hasPermission(ctx, 'customers.approve')}
        canCollect={hasPermission(ctx, 'sales.collect') || ctx.isSuperAdmin}
        canTransfer={hasPermission(ctx, 'customer.transfer')}
        canRequestCredit={hasPermission(ctx, 'credit.request.create')}
        q={q}
        filterSegment={segment}
        filterClassification={classification}
        filterChannel={channel}
        page={page}
        pageSize={pageSize}
        total={count ?? 0}
      />
    </div>
  );
}
