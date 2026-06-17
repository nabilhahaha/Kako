import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import { OnboardingManager } from './onboarding-manager';

export const dynamic = 'force-dynamic';

/** Pharmacy Catalog Onboarding — add medicines from the Global Catalog. */
export default async function PharmacyOnboardingPage() {
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const perms = ctx.permissions as string[];
  const canManage = perms.includes('inventory.adjust') || perms.includes('pricing.manage') || ctx.isSuperAdmin;
  if (!canManage) redirect('/dashboard');

  return (
    <div>
      <PageHeader title={t('pharmOnboard.title')} description={t('pharmOnboard.description')} />
      <OnboardingManager />
    </div>
  );
}
