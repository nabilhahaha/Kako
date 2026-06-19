import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import { RoutePlannerWorkspace } from './route-planner-workspace';

/**
 * Simple Route Planner (MVP) — a manager-facing, session-only surface:
 * Upload customers → enter a route count → a rough geographic split → correct it by
 * hand on the map (box / click multi-select → move) → approve → export the route
 * allocation to Excel. It never reads or writes live company data. Gated on
 * `reports.view` (same as Studio) — the Sales Supervisor / Area Manager audience.
 */
export default async function RoutePlannerPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!hasPermission(ctx, 'reports.view')) redirect('/dashboard');

  const { t } = await getT();
  return (
    <div>
      <PageHeader title={t('routePlanner.title')} description={t('routePlanner.description')} />
      <RoutePlannerWorkspace />
    </div>
  );
}
