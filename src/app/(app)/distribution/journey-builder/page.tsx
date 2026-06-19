import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import { loadTisDataset } from '@/lib/tis/server';
import { buildJeddahDemoDataset } from '@/lib/tis/demo/jeddah';
import { JourneyBuilder } from './journey-builder';

/**
 * Weekly Single-Salesman Journey Builder. Reuses the shared planning engines (FR
 * workload, day assignment, scenario board). Demo-aware; read-only + export (no live
 * writes). Ungated under reports.view / customers.manage.
 */
export default async function JourneyBuilderPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  // AC-6: management roles only (reports.view) — hidden from field reps.
  if (!hasPermission(ctx, 'reports.view')) redirect('/dashboard');

  const { t } = await getT();
  const sp = await searchParams;
  const supabase = await createClient();

  const live = sp.demo ? null : await loadTisDataset(supabase);
  const useDemo = !live || live.customers.filter((c) => c.geo).length < 10;
  const dataset = useDemo ? buildJeddahDemoDataset() : live;

  // Resolve salesman names for the picker.
  const labels: Record<string, string> = {};
  const salesmanIds = new Set(dataset.customers.map((c) => c.ownership.salesmanId).filter((v): v is string => !!v));
  if (useDemo) {
    for (const id of salesmanIds) labels[id] = `Salesman ${id.replace(/^sm-/, '')}`;
  } else if (salesmanIds.size) {
    const { data } = await supabase.rpc('erp_assignable_reps');
    for (const r of (data as { id: string; full_name: string | null; email: string | null }[] | null) ?? []) {
      if (salesmanIds.has(r.id)) labels[r.id] = r.full_name || r.email || r.id;
    }
  }

  return (
    <div>
      <PageHeader title={t('journeyBuilder.title')} description={t('journeyBuilder.description')} />
      <JourneyBuilder customers={dataset.customers} asOf={dataset.asOf} source={dataset.source} labels={labels} />
    </div>
  );
}
