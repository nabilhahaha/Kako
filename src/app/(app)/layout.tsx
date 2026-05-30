import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { Sidebar } from '@/components/layout/sidebar';
import { TopBar } from '@/components/layout/topbar';
import { CommandPalette } from '@/components/layout/command-palette';
import { ConfirmProvider } from '@/components/confirm-dialog';
import { PromptProvider } from '@/components/prompt-dialog';
import { companyLocked, subscriptionState, daysLeft } from '@/lib/erp/subscription';
import { whatsappLink, SUPPORT_PHONE, SUPPORT_PHONE_DISPLAY } from '@/lib/erp/contact';
import { LockKeyhole, AlertTriangle, MessageCircle } from 'lucide-react';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  // A signed-in user who isn't platform staff and has no company yet is sent to
  // self-service onboarding to create their company (free trial).
  if (!ctx.isPlatformOwner && !ctx.isSuperAdmin && ctx.memberships.length === 0) {
    redirect('/onboarding');
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
            {expired ? 'انتهى اشتراك شركتك' : 'تم إيقاف اشتراك شركتك'}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {expired
              ? `انتهت صلاحية الاشتراك بتاريخ ${ctx.company?.subscription_end}. للتجديد تواصل معنا.`
              : 'تم إيقاف الوصول مؤقتًا. للتفعيل تواصل معنا.'}
          </p>
          <a
            href={whatsappLink(`مرحباً، أريد تجديد/تفعيل اشتراك شركة «${ctx.company?.name_ar || ctx.company?.name || ''}».`)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-success px-4 font-medium text-success-foreground hover:opacity-90"
          >
            <MessageCircle className="h-5 w-5" />
            تواصل عبر واتساب
          </a>
          <p className="mt-2 text-xs text-muted-foreground" dir="ltr">{SUPPORT_PHONE_DISPLAY}</p>
          <form action="/auth/signout" method="post" className="mt-4">
            <button
              type="submit"
              className="inline-flex h-9 items-center justify-center rounded-md bg-secondary px-4 text-sm font-medium hover:bg-secondary/80"
            >
              تسجيل الخروج
            </button>
          </form>
        </div>
      </div>
    );
  }

  const state = ctx.isPlatformOwner ? 'open' : subscriptionState(ctx.company);
  const left = ctx.company ? daysLeft(ctx.company) : null;

  return (
    <ConfirmProvider>
     <PromptProvider>
      <div className="flex min-h-screen bg-secondary/30">
        <CommandPalette
          permissions={ctx.permissions}
          isSuperAdmin={ctx.isSuperAdmin}
          isPlatformOwner={ctx.isPlatformOwner}
          modules={ctx.modules}
        />
        <Sidebar
          permissions={ctx.permissions}
          isSuperAdmin={ctx.isSuperAdmin}
          isPlatformOwner={ctx.isPlatformOwner}
          modules={ctx.modules}
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
          />
          {state === 'expiring' && left !== null && (
            <div className="flex flex-wrap items-center gap-2 border-b bg-warning/15 px-4 py-2 text-sm text-warning-foreground lg:px-6">
              <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
              <span>ينتهي اشتراك شركتك خلال {left} يوم.</span>
              <a
                href={whatsappLink(`مرحباً، أريد تجديد اشتراك شركة «${ctx.company?.name_ar || ctx.company?.name || ''}».`)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-success underline-offset-2 hover:underline"
              >
                <MessageCircle className="h-4 w-4" /> جدّد الآن عبر واتساب
              </a>
            </div>
          )}
          <main className="flex-1 p-4 lg:p-6">{children}</main>
        </div>
      </div>
     </PromptProvider>
    </ConfirmProvider>
  );
}
