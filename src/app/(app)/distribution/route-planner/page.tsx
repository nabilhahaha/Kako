import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import type { Metadata } from 'next';
import { getUserContext } from '@/lib/erp/auth-context';
import { I18nProvider } from '@/lib/i18n/provider';
import { LOCALE_COOKIE } from '@/lib/i18n/config';
import { hasPermission } from '@/lib/erp/permissions';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import { resolveSubscription, subscriptionInputFor } from '@/lib/erp/route-planner-subscription';
import { missionPermsOf } from '@/lib/erp/route-planner-access';
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
    // VANTORA Planner defaults to ENGLISH on first load (Arabic stays fully supported with
    // RTL once the user switches — persisted in the locale cookie). Scoped to the Planner
    // via a nested provider so the wider ERP keeps its own default. The shell applies `dir`
    // to its own root, so the chrome-free experience is correct LTR/RTL regardless of the
    // outer <html dir>.
    const cookieStore = await cookies();
    const raw = cookieStore.get(LOCALE_COOKIE)?.value;
    const plannerLocale = raw === 'ar' ? 'ar' : 'en';
    // Redesign Phase A: a dashboard shell (top bar + collapsible sidebar) hosts the
    // existing workspace as a panel. Sidebar groups are gated by the user's Route Planner
    // feature grants (erp_route_planner_access); null = unrestricted.
    return (
      <I18nProvider initialLocale={plannerLocale}>
        <RoutePlannerShell
          demo={ctx.isRoutePlannerDemo}
          subscription={subscription}
          userEmail={ctx.profile?.email ?? null}
          userId={ctx.userId}
          features={null}
          isAdmin={ctx.isSuperAdmin || ctx.isPlatformOwner || ctx.topRole === 'admin' || ctx.isRoutePlannerAdmin}
          integrationAdmin={ctx.isSuperAdmin || ctx.isPlatformOwner || ctx.topRole === 'admin' || ctx.isRoutePlannerAdmin || ctx.routePlannerAccess?.role === 'route_planner_admin'}
          missionPerms={missionPermsOf(ctx.routePlannerAccess ?? null)}
        />
      </I18nProvider>
    );
  }
  return (
    <div>
      <PageHeader title={t('routePlanner.title')} description={t('routePlanner.description')} />
      <RoutePlannerWorkspace subscription={subscription} />
    </div>
  );
}
