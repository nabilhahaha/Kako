import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { getPlatformContext } from '@/lib/erp/platform-context';
import { createClient } from '@/lib/supabase/server';
import { Sidebar } from '@/components/layout/sidebar';
import { BottomNav } from '@/components/layout/bottom-nav';
import { TopBar } from '@/components/layout/topbar';
import { CommandPalette } from '@/components/layout/command-palette';
import { ConfirmProvider } from '@/components/confirm-dialog';
import { PromptProvider } from '@/components/prompt-dialog';
import { CopilotFab } from '@/components/copilot/copilot-fab';
import { TauriLinkInterceptor } from '@/components/tauri-link-interceptor';
import { SyncProvider } from '@/components/sync/sync-provider';
import { SyncBadge } from '@/components/sync/sync-badge';
import { companyLocked, subscriptionState, daysLeft } from '@/lib/erp/subscription';
import { getSetupProfile } from '@/lib/erp/setup-wizard';
import { whatsappLink, SUPPORT_PHONES } from '@/lib/erp/contact';
import { getT } from '@/lib/i18n/server';
import { LockKeyhole, AlertTriangle, MessageCircle } from 'lucide-react';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const { t, locale } = await getT();

  // Vendor-side internal employees (platform staff) belong to no tenant company;
  // they run the platform, not a company, so they skip the tenant onboarding /
  // setup / subscription gates below.
  const pctx = await getPlatformContext();
  const isPlatformStaff = Boolean(pctx?.isStaff);
  const platformPermissions: string[] = pctx?.permissions ?? [];

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

  return (
    <ConfirmProvider>
     <PromptProvider>
      <SyncProvider>
      <div className="flex min-h-screen bg-secondary/30">
        <CommandPalette
          permissions={ctx.permissions}
          isSuperAdmin={ctx.isSuperAdmin}
          isPlatformOwner={ctx.isPlatformOwner}
          modules={ctx.modules}
          platformPermissions={platformPermissions}
          isPlatformStaff={isPlatformStaff}
          businessType={ctx.company?.business_type ?? null}
        />
        <Sidebar
          permissions={ctx.permissions}
          isSuperAdmin={ctx.isSuperAdmin}
          isPlatformOwner={ctx.isPlatformOwner}
          modules={ctx.modules}
          platformPermissions={platformPermissions}
          isPlatformStaff={isPlatformStaff}
          businessType={ctx.company?.business_type ?? null}
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
          />
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
          {/* pb on mobile keeps content clear of the fixed bottom tab bar (UX-3) */}
          <main className="flex-1 p-4 pb-24 lg:p-6 lg:pb-6">{children}</main>
        </div>
        <BottomNav permissions={ctx.permissions} isSuperAdmin={ctx.isSuperAdmin} modules={ctx.modules} businessType={ctx.company?.business_type ?? null} />
        {/* Global Help Copilot — always available, outside page content. */}
        <CopilotFab />
        {/* Desktop shell: route new-tab/external links that WKWebView ignores. */}
        <TauriLinkInterceptor />
        {/* Sync status (renders only when KAKO_SYNC is enabled). */}
        <div className="print:hidden fixed bottom-3 left-3 z-40">
          <SyncBadge />
        </div>
      </div>
      </SyncProvider>
     </PromptProvider>
    </ConfirmProvider>
  );
}
