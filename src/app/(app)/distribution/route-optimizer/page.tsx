import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import { RouteOptimizer } from './route-optimizer';

/**
 * Route Optimization Studio (RO-2). Simple-Mode shell: the client runs the
 * balancer via a server action and shows the plan + Current-vs-Optimized
 * comparison + per-route table. Read-only preview; export (RO-3) / apply (RO-4)
 * follow. Ungated under reports.view.
 */
export default async function RouteOptimizerPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!hasPermission(ctx, 'reports.view') && !hasPermission(ctx, 'customers.manage')) redirect('/dashboard');
  const { t } = await getT();
  return (
    <div>
      <PageHeader title={t('routeOpt.title')} description={t('routeOpt.description')} />
      <RouteOptimizer />
    </div>
  );
}
