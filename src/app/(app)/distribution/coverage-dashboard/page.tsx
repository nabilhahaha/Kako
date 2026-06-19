import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import { loadCoverageRollup, type CoverageGroupBy } from '@/lib/distribution/coverage-engine/server';
import { CoverageDashboard, type CoverageGroupView } from './coverage-dashboard';

/**
 * CV-2 — Manager / Supervisor Coverage Dashboard (Simple Mode). One screen:
 * headline Coverage % + On Track / Under / Never / Over with one-click drill-down
 * to the customer list. Read-only; reuses the Coverage Engine rollup (CV-1) over
 * the RLS-scoped customer set, so Salesman/Supervisor/Manager each see their own
 * scope automatically. Ungated under reports.view. No technical metrics required.
 */
export default async function CoverageDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ by?: string }>;
}) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!hasPermission(ctx, 'reports.view') && !hasPermission(ctx, 'customers.manage')) redirect('/dashboard');

  const { t, locale } = await getT();
  const ar = locale === 'ar';
  const sp = await searchParams;
  const groupBy: CoverageGroupBy = sp.by === 'route' ? 'route' : 'salesman';

  const supabase = await createClient();
  const rollup = await loadCoverageRollup(supabase, { groupBy });

  // Resolve group labels (salesman / route names) for the keys present.
  const keys = rollup.groups.map((g) => g.key).filter(Boolean);
  const labels = new Map<string, string>();
  if (keys.length > 0) {
    if (groupBy === 'route') {
      const { data } = await supabase.from('erp_routes').select('id, name, name_ar').in('id', keys);
      for (const r of (data as { id: string; name: string; name_ar: string | null }[] | null) ?? []) {
        labels.set(r.id, (ar ? r.name_ar || r.name : r.name) || r.name);
      }
    } else {
      const { data } = await supabase.rpc('erp_assignable_reps');
      for (const r of (data as { id: string; full_name: string | null; email: string | null }[] | null) ?? []) {
        if (keys.includes(r.id)) labels.set(r.id, r.full_name || r.email || '');
      }
    }
  }

  const groups: CoverageGroupView[] = rollup.groups
    .map((g) => ({ ...g, label: g.key ? labels.get(g.key) ?? '—' : t('coverage.unassigned') }))
    // Worst coverage first (managers act on the weakest groups).
    .sort((a, b) => a.coveragePct - b.coveragePct || b.total - a.total);

  return (
    <div>
      <PageHeader title={t('coverage.dashTitle')} description={t('coverage.dashDescription')} />
      <CoverageDashboard overall={rollup.overall} groups={groups} groupBy={groupBy} />
    </div>
  );
}
