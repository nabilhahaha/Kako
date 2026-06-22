import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import { resolveSubscription, subscriptionInputFor } from '@/lib/erp/route-planner-subscription';
import { RoutePlannerWorkspace } from './route-planner-workspace';
import { RoutePlannerShell } from './route-planner-shell';

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
    // Redesign Phase A: a dashboard shell (top bar + collapsible sidebar) hosts the
    // existing workspace as a panel. Sidebar groups are gated by the user's Route Planner
    // feature grants (erp_route_planner_access); null = unrestricted.
    return (
      <RoutePlannerShell
        demo={ctx.isRoutePlannerDemo}
        subscription={subscription}
        userEmail={ctx.profile?.email ?? null}
        features={null}
      />
    );
  }
  return (
    <div>
      <PageHeader title={t('routePlanner.title')} description={t('routePlanner.description')} />
      <RoutePlannerWorkspace subscription={subscription} />
    </div>
  );
}
