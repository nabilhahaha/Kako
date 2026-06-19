import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import { loadCustomerCoverage } from '@/lib/distribution/journey-plan/coverage-status-server';
import type { CoverageStatus } from '@/lib/distribution/journey-plan/coverage-status';
import { DISTRIBUTION_ENABLED } from '@/lib/distribution/flags';
import { CoverageViews } from '../coverage-dashboard/coverage-views';
import { CoverageList, type CoverageRow } from './coverage-list';

const STATUSES: CoverageStatus[] = ['on_track', 'under_covered', 'over_covered', 'never_visited'];

/**
 * CJ-3 — Customer Coverage list (exception management). Read-model only: reuses
 * `loadCustomerCoverage` (journey-plan cadence + actual visits, 28d) over the
 * RLS-scoped customer set, so manager/supervisor visibility follows existing
 * branch/territory RLS. Filters: coverage status · salesman · route. No new
 * business logic, no writes.
 */
export default async function CoverageCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; salesman?: string; route?: string }>;
}) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!hasPermission(ctx, 'reports.view') && !hasPermission(ctx, 'customers.manage')) redirect('/dashboard');

  const { t, locale } = await getT();
  const ar = locale === 'ar';
  const sp = await searchParams;
  const status = STATUSES.includes(sp.status as CoverageStatus) ? (sp.status as CoverageStatus) : '';
  const salesmanId = (sp.salesman ?? '').trim();
  const routeId = (sp.route ?? '').trim();

  const supabase = await createClient();

  // RLS-scoped active customers (optionally narrowed by salesman/route).
  let custQuery = supabase
    .from('erp_customers')
    .select('id, name, name_ar, code, salesman_id, route_id')
    .eq('is_active', true)
    .order('code')
    .limit(1000);
  if (salesmanId) custQuery = custQuery.eq('salesman_id', salesmanId);
  if (routeId) custQuery = custQuery.eq('route_id', routeId);

  const [{ data: customers }, { data: reps }, { data: routes }] = await Promise.all([
    custQuery,
    supabase.rpc('erp_assignable_reps'),
    supabase.from('erp_routes').select('id, name, name_ar').eq('is_active', true).order('name'),
  ]);

  const custRows = (customers as { id: string; name: string; name_ar: string | null; code: string | null; salesman_id: string | null; route_id: string | null }[]) ?? [];
  const repRows = (reps as { id: string; full_name: string | null; email: string | null }[]) ?? [];
  const routeRows = (routes as { id: string; name: string; name_ar: string | null }[]) ?? [];

  const repName = new Map(repRows.map((r) => [r.id, r.full_name || r.email || '']));
  const routeName = new Map(routeRows.map((r) => [r.id, ar ? (r.name_ar || r.name) : r.name]));

  // Single coverage loader behind every surface — no duplicated logic.
  const coverage = await loadCustomerCoverage(supabase, custRows.map((c) => c.id));

  let rows: CoverageRow[] = custRows.map((c) => {
    const cov = coverage.get(c.id);
    return {
      id: c.id,
      name: (ar ? (c.name_ar || c.name) : c.name) || c.name,
      code: c.code,
      salesmanName: c.salesman_id ? repName.get(c.salesman_id) ?? null : null,
      routeName: c.route_id ? routeName.get(c.route_id) ?? null : null,
      status: cov?.status ?? 'never_visited',
      expected: cov?.expected ?? 0,
      actual: cov?.actual ?? 0,
    };
  });
  if (status) rows = rows.filter((r) => r.status === status);
  // Exceptions first (never → under → over → on-track), then by name.
  const rank: Record<CoverageStatus, number> = { never_visited: 0, under_covered: 1, over_covered: 2, on_track: 3 };
  rows.sort((a, b) => rank[a.status] - rank[b.status] || a.name.localeCompare(b.name));

  return (
    <div>
      <PageHeader title={t('coverage.pageTitle')} description={t('coverage.pageDescription')} />
      <CoverageViews active="customers" showTeam={DISTRIBUTION_ENABLED()} />
      <CoverageList
        rows={rows}
        salesmen={repRows.map((r) => ({ id: r.id, name: r.full_name || r.email || '' }))}
        routes={routeRows.map((r) => ({ id: r.id, name: ar ? (r.name_ar || r.name) : r.name }))}
        status={status}
        salesmanId={salesmanId}
        routeId={routeId}
      />
    </div>
  );
}
