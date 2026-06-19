import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import { loadTisDataset } from '@/lib/tis/server';
import { buildJeddahDemoDataset } from '@/lib/tis/demo/jeddah';
import type { TisCustomer } from '@/lib/tis/dataset';
import type { SupabaseClient } from '@supabase/supabase-js';
import { StudioWorkspace } from './studio-workspace';

/** Friendly names for the Audit's region/route/salesman group keys. Live tenants
 *  resolve from the DB; the demo derives readable labels from its synthetic ids
 *  (R-Al-Balad → Al-Balad, sm-1 → Salesman 1) so findings never read as raw codes. */
async function resolveStudioLabels(supabase: SupabaseClient, customers: TisCustomer[], demo: boolean, ar: boolean): Promise<Record<string, string>> {
  const regionIds = new Set(customers.map((c) => c.ownership.regionId).filter((v): v is string => !!v));
  const routeIds = new Set(customers.map((c) => c.ownership.routeId).filter((v): v is string => !!v));
  const salesmanIds = new Set(customers.map((c) => c.ownership.salesmanId).filter((v): v is string => !!v));
  const labels: Record<string, string> = {};

  if (demo) {
    for (const id of regionIds) labels[id] = id.replace(/^region-/, '');
    for (const id of routeIds) labels[id] = id.replace(/^R-/, '');
    for (const id of salesmanIds) labels[id] = `Salesman ${id.replace(/^sm-/, '')}`;
    return labels;
  }

  const [regions, routes, reps] = await Promise.all([
    regionIds.size ? supabase.from('erp_regions').select('id, name, name_ar').in('id', [...regionIds]) : Promise.resolve({ data: [] }),
    routeIds.size ? supabase.from('erp_routes').select('id, name, name_ar').in('id', [...routeIds]) : Promise.resolve({ data: [] }),
    salesmanIds.size ? supabase.rpc('erp_assignable_reps') : Promise.resolve({ data: [] }),
  ]);
  for (const r of (regions.data as { id: string; name: string; name_ar: string | null }[] | null) ?? []) labels[r.id] = (ar ? r.name_ar || r.name : r.name) || r.name;
  for (const r of (routes.data as { id: string; name: string; name_ar: string | null }[] | null) ?? []) labels[r.id] = (ar ? r.name_ar || r.name : r.name) || r.name;
  for (const r of (reps.data as { id: string; full_name: string | null; email: string | null }[] | null) ?? []) if (salesmanIds.has(r.id)) labels[r.id] = r.full_name || r.email || '';
  return labels;
}

/**
 * Territory Intelligence Studio (STUDIO-1) — one map-centric workspace folding
 * Audit · Geo · Optimize · Plan · Size into a single sub-navigated experience
 * over ONE shared dataset + scenario state. Composition only: every stage reuses
 * an existing engine/surface; the standalone routes remain as deep-links.
 * Read-only + export everywhere; Apply (RO-4/VTP-4) stays paused.
 *
 * Dataset: the live RLS-scoped tenant, OR the 500-customer Jeddah demo when
 * `?demo=1` or the live tenant has no geo-located customers — so the Studio is
 * always populated + browser-previewable. Ungated under reports.view.
 */
export default async function StudioPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!hasPermission(ctx, 'reports.view') && !hasPermission(ctx, 'customers.manage')) redirect('/dashboard');

  const { t, locale } = await getT();
  const sp = await searchParams;
  const supabase = await createClient();

  const live = sp.demo ? null : await loadTisDataset(supabase);
  const useDemo = !live || live.customers.filter((c) => c.geo).length < 10;
  const dataset = useDemo ? buildJeddahDemoDataset() : live;
  const labels = await resolveStudioLabels(supabase, dataset.customers, useDemo, locale === 'ar');

  return (
    <div>
      <PageHeader title={t('studio.title')} description={t('studio.description')} />
      <StudioWorkspace customers={dataset.customers} asOf={dataset.asOf} source={dataset.source} demo={useDemo} labels={labels} />
    </div>
  );
}
