import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import { resolveSubscription, subscriptionInputFor } from '@/lib/erp/route-planner-subscription';
import { RoutePlannerWorkspace } from './route-planner-workspace';

export const metadata: Metadata = { title: 'VANTORA Route Planner' };

/**
 * Simple Route Planner — a manager-facing, session-only surface: Upload customers →
 * map columns → split / review / correct on the map → approve → export to Excel. It
 * never reads or writes live company data. Open to anyone with `reports.view` (or the
 * dedicated `route_planner.view`), and to the locked-down Route Planner Demo account,
 * which renders a chrome-free, branded "focus" experience.
 */
export default async function RoutePlannerPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const allowed = ctx.isRoutePlannerExperience || hasPermission(ctx, 'route_planner.view') || hasPermission(ctx, 'reports.view');
  if (!allowed) redirect('/dashboard');

  const { t } = await getT();
  const subscription = resolveSubscription(subscriptionInputFor(ctx.company, { isDemo: ctx.isRoutePlannerDemo }));
  if (ctx.isRoutePlannerExperience) {
    // Standalone, presentation-quality experience — the workspace renders its own
    // branding header / badge; no platform PageHeader. The demo badge shows only for the
    // temporary demo account, not for real Route Planner tenants.
    return <RoutePlannerWorkspace focus demo={ctx.isRoutePlannerDemo} subscription={subscription} />;
  }
  return (
    <div>
      <PageHeader title={t('routePlanner.title')} description={t('routePlanner.description')} />
      <RoutePlannerWorkspace subscription={subscription} />
    </div>
  );
}
