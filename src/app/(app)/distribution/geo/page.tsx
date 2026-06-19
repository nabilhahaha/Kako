import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import { loadTisDataset } from '@/lib/tis/server';
import { auditTerritory } from '@/lib/tis/audit';
import { buildGeoLayers } from '@/lib/tis/geo';
import { GeoMap } from './geo-map';

/**
 * Geo Intelligence Base Map (GEO-2). Server-assembles the TIS-0 dataset + Territory
 * Audit into provider-agnostic geo layers (GEO-1) and hands them to the MapLibre
 * renderer. Read-only, RLS-scoped, Simple Mode. Ungated under reports.view.
 */
export default async function GeoPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!hasPermission(ctx, 'reports.view') && !hasPermission(ctx, 'customers.manage')) redirect('/dashboard');

  const { t, locale } = await getT();
  const ar = locale === 'ar';
  const supabase = await createClient();
  const dataset = await loadTisDataset(supabase);
  const audit = auditTerritory(dataset);
  const layers = buildGeoLayers(dataset, audit);

  // Resolve ownership (salesman) + territory (region) category labels for legends.
  const salesmanIds = new Set(layers.ownership.legend.map((l) => l.category).filter(Boolean));
  const regionIds = new Set(layers.imbalance.legend.map((l) => l.category).filter(Boolean));
  const labels: Record<string, string> = {};
  const [reps, regions] = await Promise.all([
    salesmanIds.size ? supabase.rpc('erp_assignable_reps') : Promise.resolve({ data: [] }),
    regionIds.size ? supabase.from('erp_regions').select('id, name, name_ar').in('id', [...regionIds]) : Promise.resolve({ data: [] }),
  ]);
  for (const r of (reps.data as { id: string; full_name: string | null; email: string | null }[] | null) ?? []) if (salesmanIds.has(r.id)) labels[r.id] = r.full_name || r.email || '';
  for (const r of (regions.data as { id: string; name: string; name_ar: string | null }[] | null) ?? []) labels[r.id] = (ar ? r.name_ar || r.name : r.name) || r.name;

  return (
    <div>
      <PageHeader title={t('geo.title')} description={t('geo.description')} />
      <GeoMap layers={layers} labels={labels} />
    </div>
  );
}
