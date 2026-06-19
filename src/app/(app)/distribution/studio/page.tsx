import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import { loadTisDataset } from '@/lib/tis/server';
import { buildJeddahDemoDataset } from '@/lib/tis/demo/jeddah';
import { StudioWorkspace } from './studio-workspace';

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

  const { t } = await getT();
  const sp = await searchParams;
  const supabase = await createClient();

  const live = sp.demo ? null : await loadTisDataset(supabase);
  const useDemo = !live || live.customers.filter((c) => c.geo).length < 10;
  const dataset = useDemo ? buildJeddahDemoDataset() : live;

  return (
    <div>
      <PageHeader title={t('studio.title')} description={t('studio.description')} />
      <StudioWorkspace customers={dataset.customers} asOf={dataset.asOf} source={dataset.source} demo={useDemo} />
    </div>
  );
}
