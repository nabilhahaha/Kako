import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import { loadTisDataset } from '@/lib/tis/server';
import { buildJeddahDemoDataset } from '@/lib/tis/demo/jeddah';
import { PlanningBoard } from './planning-board';

/**
 * Visual Territory Planning — drag-and-drop board (VTP-2). Simple Mode: open →
 * Optimize → drag customers between routes → compare → export. All editing is
 * client-side over the pure TIS-0 scenario engine (instant metrics). Read-only on
 * the server (no write); Apply (VTP-4) is the escalated write fork.
 *
 * Dataset: the live RLS-scoped tenant, OR the 500-customer Jeddah demo when
 * `?demo=1` or the live tenant has no geo-located customers — so the board is
 * always populated + browser-previewable. Ungated under reports.view.
 */
export default async function PlanningBoardPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
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
      <PageHeader title={t('planBoard.title')} description={useDemo ? t('planBoard.demoNote') : t('planBoard.description')} />
      <PlanningBoard customers={dataset.customers} asOf={dataset.asOf} source={dataset.source} />
    </div>
  );
}
