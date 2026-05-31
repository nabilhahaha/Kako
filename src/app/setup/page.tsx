import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { resolveHomePath } from '@/lib/erp/home';
import { getSetupProfile } from '@/lib/erp/setup-wizard';
import { BUSINESS_TYPE_LABELS } from '@/lib/erp/subscription';
import { getLocale } from '@/lib/i18n/server';
import type { BusinessType } from '@/lib/erp/types';
import { SetupWizard } from './setup-wizard';

export default async function SetupPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  // Only the company owner (admin) runs setup; everyone else (or no profile /
  // already done) goes to their normal home.
  const isCompanyAdmin = ctx.memberships.some((m) => m.role === 'admin');
  const profile = ctx.company ? getSetupProfile(ctx.company.business_type) : null;
  if (!isCompanyAdmin || !ctx.company || ctx.company.setup_done !== false || !profile) {
    redirect(resolveHomePath(ctx));
  }

  const locale = await getLocale();
  const bt = ctx.company.business_type as BusinessType | null;
  const businessLabel = bt ? BUSINESS_TYPE_LABELS[bt][locale] : '';

  return (
    <SetupWizard
      profile={profile}
      companyName={ctx.company.name_ar || ctx.company.name}
      businessLabel={businessLabel}
    />
  );
}
