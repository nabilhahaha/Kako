import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import { loadTerritoryAudit } from '@/lib/tis/server';
import { TerritoryAuditView } from './territory-audit';

/**
 * Territory Audit (TA-2) — the first TIS surface, Simple Mode. Runs the pure
 * auditTerritory engine over the live, RLS-scoped TIS dataset: headline +
 * coverage gaps · territory/route imbalance · distribution · internal white-space,
 * each drilling into the existing customer/coverage lists. Capability-aware
 * (sections that lack data show a "needs X" hint). Ungated under reports.view.
 */
export default async function TerritoryAuditPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!hasPermission(ctx, 'reports.view') && !hasPermission(ctx, 'customers.manage')) redirect('/dashboard');

  const { t, locale } = await getT();
  const ar = locale === 'ar';
  const supabase = await createClient();
  const audit = await loadTerritoryAudit(supabase);

  // Resolve group labels (region / route names) referenced by the balance sections.
  const regionIds = new Set((audit.territoryBalance?.groups ?? []).map((g) => g.key).filter(Boolean));
  const routeIds = new Set((audit.routeBalance?.groups ?? []).map((g) => g.key).filter(Boolean));
  const salesmanIds = new Set(audit.coverageGaps.byGroup.map((g) => g.key).filter(Boolean));

  const labels: Record<string, string> = {};
  const [regions, routes, reps] = await Promise.all([
    regionIds.size ? supabase.from('erp_regions').select('id, name, name_ar').in('id', [...regionIds]) : Promise.resolve({ data: [] }),
    routeIds.size ? supabase.from('erp_routes').select('id, name, name_ar').in('id', [...routeIds]) : Promise.resolve({ data: [] }),
    salesmanIds.size ? supabase.rpc('erp_assignable_reps') : Promise.resolve({ data: [] }),
  ]);
  for (const r of (regions.data as { id: string; name: string; name_ar: string | null }[] | null) ?? []) labels[r.id] = (ar ? r.name_ar || r.name : r.name) || r.name;
  for (const r of (routes.data as { id: string; name: string; name_ar: string | null }[] | null) ?? []) labels[r.id] = (ar ? r.name_ar || r.name : r.name) || r.name;
  for (const r of (reps.data as { id: string; full_name: string | null; email: string | null }[] | null) ?? []) if (salesmanIds.has(r.id)) labels[r.id] = r.full_name || r.email || '';

  return (
    <div>
      <PageHeader title={t('territoryAudit.title')} description={t('territoryAudit.description')} />
      <TerritoryAuditView audit={audit} labels={labels} />
    </div>
  );
}
