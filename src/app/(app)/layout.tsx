import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getUserContext } from '@/lib/erp/auth-context';
import { getPlatformContext } from '@/lib/erp/platform-context';
import { createClient } from '@/lib/supabase/server';
import { Sidebar } from '@/components/layout/sidebar';
import { BottomNav } from '@/components/layout/bottom-nav';
import { TopBar } from '@/components/layout/topbar';
import { CommandPalette } from '@/components/layout/command-palette';
import { SEARCH_ENABLED } from '@/lib/search/flags';
import { enabledNavFlags } from '@/lib/erp/nav-flags';
import { getFeatureFlags } from '@/lib/erp/feature-flags';
import { ConfirmProvider } from '@/components/confirm-dialog';
import { PromptProvider } from '@/components/prompt-dialog';
import { CopilotFab } from '@/components/copilot/copilot-fab';
import { OfflineStatusBar } from '@/components/layout/offline-status-bar';
import { MOBILE_ENABLED } from '@/lib/offline-sync';
import { companyLocked, subscriptionState, daysLeft } from '@/lib/erp/subscription';
import { isVanSalesActive } from '@/lib/van-sales/settings-server';
import { hasPermission } from '@/lib/erp/permissions';
import { unifiedSalesmanWorkspaceEnabled, salesmanRequestsEnabled } from '@/lib/van-sales/sell';
import { getSetupProfile } from '@/lib/erp/setup-wizard';
import { whatsappLink, SUPPORT_PHONES } from '@/lib/erp/contact';
import { getT } from '@/lib/i18n/server';
import { isRouteModuleAllowed } from '@/lib/erp/navigation';
import { LockKeyhole, AlertTriangle, MessageCircle } from 'lucide-react';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  // Route Planner experience: a locked-down, chrome-free single-screen product. Driven by
  // membership of a Route Planner tenant (the demo email is just a temporary trigger). No
  // sidebar / top bar / bottom nav / command palette, and it bypasses the tenant
  // onboarding / setup / subscription gates — the page renders its own branding.
  if (ctx.isRoutePlannerExperience) {
    return (
      <ConfirmProvider>
        <PromptProvider>
          <main className="min-h-screen bg-background">{children}</main>
        </PromptProvider>
      </ConfirmProvider>
    );
  }

  // Route Planner Admin: a limited, product-scoped console — same chrome-free shell, no
  // platform sidebar / nav / module gates. It can only reach its own /planner-admin pages
  // (the pages themselves enforce the route_planner.admin guard).
  if (ctx.isRoutePlannerAdmin) {
    return (
      <ConfirmProvider>
        <PromptProvider>
          <main className="min-h-screen bg-background">{children}</main>
        </PromptProvider>
      </ConfirmProvider>
    );
  }

  const { t, locale } = await getT();

  // Vendor-side internal employees (platform staff) belong to no tenant company;
  // they run the platform, not a company, so they skip the tenant onboarding /
  // setup / subscription gates below.
  const pctx = await getPlatformContext();
  const isPlatformStaff = Boolean(pctx?.isStaff);
  const platformPermissions: string[] = pctx?.permissions ?? [];
  // Feature-flag tokens that are ON (server-side) → drives flag-aware nav so
  // flag-gated pages (Alerts, Change Requests, Van Sales settings) appear when
  // enabled and disappear cleanly when off — no URL-only orphans.
  // Merge env-based flags with the tenant's enabled FEATURE flags (erp_feature_flags)
  // so feature-gated nav items (pharmacy batch/expiry/…) appear only when the
  // company has the feature ON. Disabled features leave no nav orphan.
  const tenantFeatures = await getFeatureFlags(await createClient(), ctx.companyId);
  // Unified salesman workspace (flag ON + a van salesman, not an admin/manager):
  // drives the Customer-first bottom nav (no duplicate Home / Sell). Computed once
  // and reused by the BottomNav below.
  const vanSalesActive = await isVanSalesActive(await createClient(), ctx);
  const isVanSalesman = hasPermission(ctx, 'field.sales') && !hasPermission(ctx, 'settings.branches') && !ctx.isSuperAdmin;
  const unifiedWorkspace = unifiedSalesmanWorkspaceEnabled(tenantFeatures) && vanSalesActive && isVanSalesman;
  const requestsEnabled = salesmanRequestsEnabled(tenantFeatures) && vanSalesActive && isVanSalesman;
  const navFlags = [
    ...enabledNavFlags(),
    ...Object.keys(tenantFeatures).filter((k) => tenantFeatures[k]),
  ];

  // A signed-in user who isn't platform staff and has no company yet is sent to
  // self-service onboarding to create their company (free trial).
  if (!ctx.isPlatformOwner && !ctx.isSuperAdmin && !isPlatformStaff && ctx.memberships.length === 0) {
    redirect('/onboarding');
  }

  // First-run setup wizard: a fresh company whose business type has a setup
  // profile is sent to /setup once. The company admin (owner) runs it.
  const isCompanyAdmin = ctx.memberships.some((m) => m.role === 'admin');
  if (
    isCompanyAdmin &&
    ctx.company &&
    ctx.company.setup_done === false &&
    getSetupProfile(ctx.company.business_type)
  ) {
    redirect('/setup');
  }

  // Subscription gate: a tenant whose company is suspended or expired is
  // locked out (read-only message). The vendor (platform owner) is exempt.
  const locked = !ctx.isPlatformOwner && companyLocked(ctx.company);
  if (locked) {
    const expired = subscriptionState(ctx.company) === 'expired';
    return (
      <div className="flex min-h-screen items-center justify-center bg-secondary/30 p-4">
        <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <LockKeyhole className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-bold">
            {expired ? t('subscription.expiredTitle') : t('subscription.suspendedTitle')}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {expired
              ? t('subscription.expiredBody', { date: ctx.company?.subscription_end ?? '' })
              : t('subscription.suspendedBody')}
          </p>
          <a
            href={whatsappLink(`مرحباً، أريد تجديد/تفعيل اشتراك شركة «${ctx.company?.name_ar || ctx.company?.name || ''}».`)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-success px-4 font-medium text-success-foreground hover:opacity-90"
          >
            <MessageCircle className="h-5 w-5" />
            {t('subscription.contactWhatsapp')}
          </a>
          <p className="mt-2 text-xs text-muted-foreground" dir="ltr">{SUPPORT_PHONES.map((p) => p.display).join('  •  ')}</p>
          <form action="/auth/signout" method="post" className="mt-4">
            <button
              type="submit"
              className="inline-flex h-9 items-center justify-center rounded-md bg-secondary px-4 text-sm font-medium hover:bg-secondary/80"
            >
              {t('common.signOut')}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Direct-route module guard: a disabled module must be blocked at the URL level,
  // not only hidden from the sidebar. The platform owner / super admin implicitly
  // hold every module (ctx.modules = ALL_MODULES) so they are never blocked; a legacy
  // tenant with no module rows has an empty list, which isRouteModuleAllowed treats as
  // unrestricted (no regression). Scoped by company_id via ctx.modules. The guard maps
  // the path to its NAV_SECTIONS module gate, so it can never drift from the nav.
  if (!ctx.isPlatformOwner && !ctx.isSuperAdmin) {
    const pathname = (await headers()).get('x-pathname') ?? '';
    if (pathname && !isRouteModuleAllowed(ctx.modules, pathname)) {
      redirect(`/module-unavailable?from=${encodeURIComponent(pathname)}`);
    }
  }

  const state = ctx.isPlatformOwner ? 'open' : subscriptionState(ctx.company);
  const left = ctx.company ? daysLeft(ctx.company) : null;

  // Lightweight, module-gated alerts for the top-bar bell.
  const notifications: { label: string; href: string; count: number }[] = [];
  if (ctx.companyId && !ctx.isPlatformOwner) {
    const supabase = await createClient();
    const mods = ctx.modules;
    const today = new Date().toISOString().slice(0, 10);
    const dayRange = [`${today}T00:00:00`, `${today}T23:59:59`] as const;
    const wantSales = mods.includes('sales') || mods.includes('wholesale') || mods.includes('accounting');
    const [overdue, clinicAppts, salonAppts] = await Promise.all([
      wantSales
        ? supabase.from('erp_invoices').select('id', { count: 'exact', head: true }).lt('due_date', today).in('status', ['issued', 'partially_paid', 'overdue'])
        : Promise.resolve({ count: 0 }),
      mods.includes('clinic')
        ? supabase.from('erp_clinic_appointments').select('id', { count: 'exact', head: true }).gte('scheduled_at', dayRange[0]).lte('scheduled_at', dayRange[1]).in('status', ['scheduled', 'confirmed'])
        : Promise.resolve({ count: 0 }),
      mods.includes('salon')
        ? supabase.from('erp_salon_appointments').select('id', { count: 'exact', head: true }).gte('scheduled_at', dayRange[0]).lte('scheduled_at', dayRange[1]).in('status', ['scheduled', 'confirmed'])
        : Promise.resolve({ count: 0 }),
    ]);
    if ((overdue.count ?? 0) > 0) notifications.push({ label: t('shell.overdueInvoices'), href: '/sales/invoices', count: overdue.count! });
    if ((clinicAppts.count ?? 0) > 0) notifications.push({ label: t('shell.todayAppointments'), href: '/clinic/appointments', count: clinicAppts.count! });
    if ((salonAppts.count ?? 0) > 0) notifications.push({ label: t('shell.todayAppointments'), href: '/salon/appointments', count: salonAppts.count! });
  }

  // In-app notification center: surface recent unread notifications in the bell.
  {
    const supabase = await createClient();
    const { data: unread } = await supabase
      .from('erp_notifications')
      .select('title_ar, title_en, link')
      .eq('is_read', false)
      .order('created_at', { ascending: false })
      .limit(10);
    for (const n of (unread as { title_ar: string | null; title_en: string | null; link: string | null }[]) ?? []) {
      notifications.push({ label: (locale === 'ar' ? n.title_ar : n.title_en) || n.title_ar || n.title_en || 'Notification', href: n.link || '/notifications', count: 1 });
    }
  }

  // Permission-filtered "+ Quick action" shortcuts (pure navigation).
  const quickActions = [
    (ctx.isSuperAdmin || hasPermission(ctx, 'settings.users')) && { href: '/settings/users', labelKey: 'quickActions.addUser', icon: 'user' },
    hasPermission(ctx, 'settings.branches') && { href: '/settings/branches', labelKey: 'quickActions.addBranch', icon: 'branch' },
    hasPermission(ctx, 'product.edit') && { href: '/settings/product-structure', labelKey: 'quickActions.addProduct', icon: 'product' },
    hasPermission(ctx, 'integrations.manage') && { href: '/settings/import', labelKey: 'quickActions.import', icon: 'import' },
    hasPermission(ctx, 'integrations.manage') && { href: '/settings/go-live', labelKey: 'quickActions.goLive', icon: 'rocket' },
    (salesmanRequestsEnabled(tenantFeatures) && vanSalesActive && (hasPermission(ctx, 'field.sales') || ctx.isSuperAdmin)) && { href: '/field/van-sales/requests', labelKey: 'quickActions.fieldRequests', icon: 'requests' },
  ].filter(Boolean) as { href: string; labelKey: string; icon: string }[];

  return (
    <ConfirmProvider>
     <PromptProvider>
      <div className="flex min-h-screen bg-secondary/30">
        <CommandPalette
          permissions={ctx.permissions}
          isSuperAdmin={ctx.isSuperAdmin}
          isPlatformOwner={ctx.isPlatformOwner}
          modules={ctx.modules}
          platformPermissions={platformPermissions}
          isPlatformStaff={isPlatformStaff}
          businessType={ctx.company?.business_type ?? null}
          recordsSearch={SEARCH_ENABLED()}
          enabledFlags={navFlags}
        />
        <Sidebar
          permissions={ctx.permissions}
          isSuperAdmin={ctx.isSuperAdmin}
          isPlatformOwner={ctx.isPlatformOwner}
          modules={ctx.modules}
          platformPermissions={platformPermissions}
          isPlatformStaff={isPlatformStaff}
          businessType={ctx.company?.business_type ?? null}
          enabledFlags={navFlags}
          roles={ctx.memberships.map((m) => m.role)}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            fullName={ctx.profile.full_name}
            email={ctx.profile.email}
            isSuperAdmin={ctx.isSuperAdmin}
            memberships={ctx.memberships.map((m) => ({
              branchName: m.branch.name_ar || m.branch.name,
              role: m.role,
            }))}
            notifications={notifications}
            quickActions={quickActions}
          />
          {MOBILE_ENABLED() && <OfflineStatusBar />}
          {state === 'expiring' && left !== null && (
            <div className="flex flex-wrap items-center gap-2 border-b bg-warning/15 px-4 py-2 text-sm text-warning-foreground lg:px-6">
              <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
              <span>{t('subscription.expiringSoon', { days: left })}</span>
              <a
                href={whatsappLink(`مرحباً، أريد تجديد اشتراك شركة «${ctx.company?.name_ar || ctx.company?.name || ''}».`)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-success underline-offset-2 hover:underline"
              >
                <MessageCircle className="h-4 w-4" /> {t('subscription.renewNow')}
              </a>
            </div>
          )}
          {/* pb on mobile keeps content clear of the fixed bottom tab bar + the
              device home-indicator inset (UX-3 / safe-area). */}
          <main className="flex-1 p-4 pb-nav-safe lg:p-6 lg:pb-6">{children}</main>
        </div>
        <BottomNav permissions={ctx.permissions} isSuperAdmin={ctx.isSuperAdmin} modules={ctx.modules} businessType={ctx.company?.business_type ?? null} vanSalesActive={vanSalesActive} unifiedWorkspace={unifiedWorkspace} requestsEnabled={requestsEnabled} />
        {/* Global Help Copilot — always available, outside page content. */}
        <CopilotFab />
      </div>
     </PromptProvider>
    </ConfirmProvider>
  );
}
