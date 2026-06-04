import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { getPlatformContext, hasPlatformPermission } from '@/lib/erp/platform-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import type { Company } from '@/lib/erp/types';
import type { SubscriptionState } from '@/lib/erp/subscription';
import { CompaniesManager, type CompanyRow } from './companies-manager';
import { getT } from '@/lib/i18n/server';
import { DEFAULT_PAGE_SIZE, param, pageNumber, rangeFor, type SearchParams } from '@/lib/list-params';

export type CompanySort = 'name' | 'expiry' | 'created';

const STATUS_VALUES: SubscriptionState[] = ['active', 'expiring', 'expired', 'suspended', 'trial'];
const SORT_VALUES: CompanySort[] = ['name', 'expiry', 'created'];

/** YYYY-MM-DD for the local "today" used by daysLeft/subscriptionState. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function addDaysIso(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function PlatformCompaniesPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const pctx = await getPlatformContext();

  if (!hasPlatformPermission(pctx, 'view_companies')) {
    return (
      <div>
        <PageHeader title={t('platform.overview.title')} />
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {t('platform.ownerOnly')}
          </CardContent>
        </Card>
      </div>
    );
  }

  const sp = (await searchParams) ?? {};
  const page = pageNumber(sp);
  const pageSize = DEFAULT_PAGE_SIZE;
  const q = (param(sp, 'q') ?? '').trim();
  const statusRaw = param(sp, 'status');
  const status = STATUS_VALUES.includes(statusRaw as SubscriptionState)
    ? (statusRaw as SubscriptionState)
    : 'all';
  const sortRaw = param(sp, 'sort');
  const sort: CompanySort = SORT_VALUES.includes(sortRaw as CompanySort) ? (sortRaw as CompanySort) : 'name';
  const dir = param(sp, 'dir') === 'desc' ? 'desc' : 'asc';

  const supabase = await createClient();

  // ── Build the (read-only) companies query from URL state ──────────────────
  const today = todayIso();
  const soon = addDaysIso(14); // matches subscriptionState's "expiring" (≤14d) threshold

  let query = supabase.from('erp_companies').select('*', { count: 'exact' });

  if (q) {
    // search name / name_ar / slug (case-insensitive substring)
    const like = `%${q}%`;
    query = query.or(`name.ilike.${like},name_ar.ilike.${like},slug.ilike.${like}`);
  }

  // Status → SQL predicates mirroring src/lib/erp/subscription.ts precedence:
  //   suspended  : is_active = false
  //   trial      : is_active AND trial_ends_at >= today (active trial wins)
  //   (the rest require is_active AND NOT active-trial)
  //   expired    : subscription_end < today
  //   expiring   : today <= subscription_end <= today+14
  //   active     : subscription_end > today+14
  //   (open/null end falls under 'active' bucket in the UI's "all"; not a filter)
  switch (status) {
    case 'suspended':
      query = query.eq('is_active', false);
      break;
    case 'trial':
      query = query.eq('is_active', true).gte('trial_ends_at', today);
      break;
    case 'expired':
      query = query
        .eq('is_active', true)
        .or(`trial_ends_at.is.null,trial_ends_at.lt.${today}`)
        .lt('subscription_end', today);
      break;
    case 'expiring':
      query = query
        .eq('is_active', true)
        .or(`trial_ends_at.is.null,trial_ends_at.lt.${today}`)
        .gte('subscription_end', today)
        .lte('subscription_end', soon);
      break;
    case 'active':
      query = query
        .eq('is_active', true)
        .or(`trial_ends_at.is.null,trial_ends_at.lt.${today}`)
        .gt('subscription_end', soon);
      break;
    default:
      break;
  }

  // Sorting. 'name' uses name_ar (Arabic-first display) with name as a tiebreak.
  const ascending = dir === 'asc';
  if (sort === 'expiry') {
    query = query.order('subscription_end', { ascending, nullsFirst: false });
  } else if (sort === 'created') {
    query = query.order('created_at', { ascending });
  } else {
    query = query.order('name_ar', { ascending, nullsFirst: false }).order('name', { ascending });
  }

  const [from, to] = rangeFor(page, pageSize);
  const { data: companies, count } = await query.range(from, to);

  const companyList = (companies as Company[]) ?? [];
  const total = count ?? companyList.length;

  // Branch / user counts: only for the companies on THIS page (cheap, scoped).
  const pageIds = companyList.map((c) => c.id);
  const branchCount = new Map<string, number>();
  const usersByCompany = new Map<string, Set<string>>();
  let branchRows: { id: string; company_id: string }[] = [];

  if (pageIds.length > 0) {
    const { data: branches } = await supabase
      .from('erp_branches')
      .select('id, company_id')
      .in('company_id', pageIds);
    branchRows = (branches as { id: string; company_id: string }[]) ?? [];
    const branchToCompany = new Map<string, string>();
    for (const b of branchRows) {
      branchToCompany.set(b.id, b.company_id);
      branchCount.set(b.company_id, (branchCount.get(b.company_id) ?? 0) + 1);
    }
    const branchIds = branchRows.map((b) => b.id);
    if (branchIds.length > 0) {
      const { data: userBranches } = await supabase
        .from('erp_user_branches')
        .select('user_id, branch_id')
        .in('branch_id', branchIds);
      for (const ub of (userBranches as { user_id: string; branch_id: string }[]) ?? []) {
        const companyId = branchToCompany.get(ub.branch_id);
        if (!companyId) continue;
        let set = usersByCompany.get(companyId);
        if (!set) {
          set = new Set<string>();
          usersByCompany.set(companyId, set);
        }
        set.add(ub.user_id);
      }
    }
  }

  // Create-form prefill data (business type → default modules / roles).
  const [{ data: btModules }, { data: btRoleRows }, { data: roleRows }] = await Promise.all([
    supabase.from('erp_business_type_modules').select('business_type, module'),
    supabase.from('erp_business_type_roles').select('business_type, role_key'),
    supabase.from('erp_roles').select('key, name_ar').order('rank', { ascending: false }),
  ]);

  const btDefaults: Record<string, string[]> = {};
  for (const r of (btModules as { business_type: string; module: string }[]) ?? []) {
    (btDefaults[r.business_type] ??= []).push(r.module);
  }
  const btRoles: Record<string, string[]> = {};
  for (const r of (btRoleRows as { business_type: string; role_key: string }[]) ?? []) {
    (btRoles[r.business_type] ??= []).push(r.role_key);
  }
  const roleLabels: Record<string, string> = Object.fromEntries(
    ((roleRows as { key: string; name_ar: string }[]) ?? []).map((r) => [r.key, r.name_ar]),
  );

  const rows: CompanyRow[] = companyList.map((c) => ({
    company: c,
    branches: branchCount.get(c.id) ?? 0,
    users: usersByCompany.get(c.id)?.size ?? 0,
  }));

  return (
    <div>
      <PageHeader
        title={t('platform.companies.title')}
        description={t('platform.companies.description')}
      />
      <Suspense fallback={null}>
        <CompaniesManager
          rows={rows}
          total={total}
          page={page}
          pageSize={pageSize}
          filters={{ q, status, sort, dir }}
          btDefaults={btDefaults}
          btRoles={btRoles}
          roleLabels={roleLabels}
        />
      </Suspense>
    </div>
  );
}
