import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { Users, ChevronRight } from 'lucide-react';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { getT } from '@/lib/i18n/server';
import { FORM_BUILDER_ENABLED } from '@/lib/form-builder';
import { VerificationAdminPanel } from '@/app/(app)/distribution/route-planner/verification-admin-panel';
import { VerificationFormPanel } from '@/app/(app)/distribution/route-planner/verification-form-panel';
import { CustomerListsPanel } from '@/app/(app)/distribution/route-planner/customer-lists-panel';

export const metadata: Metadata = { title: 'VANTORA — Field Verification Setup' };

/**
 * PKG-2 — standalone Field Verification admin setup (upload · assign · catalog ·
 * radius). Reuses the existing VerificationAdminPanel (no logic change). The panel's
 * sections carry ids (#fv-upload / #fv-assign / #fv-catalog / #fv-radius) so the
 * sidebar sub-items deep-link into them. The Form Builder panel (#fv-form) is shown only
 * when KAKO_FORM_BUILDER is enabled. Admin-gated.
 *
 * The "Users & access" entry (#fv-users) is a discoverability link to the EXISTING,
 * company-scoped staff management (Settings → Staff) — no parallel user system. It is
 * shown only when the admin holds `settings.users`, so it never appears for an FV admin
 * who cannot manage users.
 */
export default async function FvSetupPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!hasPermission(ctx, 'field_verification.admin')) redirect('/dashboard');
  const { t } = await getT();
  const canManageUsers = hasPermission(ctx, 'settings.users') && !!ctx.companyId;
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <h1 className="text-lg font-extrabold">Field Verification Setup</h1>
      <VerificationAdminPanel />
      <CustomerListsPanel />
      {FORM_BUILDER_ENABLED() && <VerificationFormPanel />}

      {canManageUsers && (
        <section id="fv-users" className="scroll-mt-20 rounded-xl border bg-card p-4">
          <h3 className="flex items-center gap-2 text-sm font-bold"><Users className="h-4 w-4" />{t('rpVerifyAdmin.usersTitle')}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{t('rpVerifyAdmin.usersHint')}</p>
          <Link
            href="/settings/staff"
            className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-semibold hover:bg-muted/50"
          >
            <Users className="h-4 w-4" />{t('rpVerifyAdmin.usersOpen')}<ChevronRight className="h-4 w-4 rtl:rotate-180" />
          </Link>
        </section>
      )}
    </div>
  );
}
