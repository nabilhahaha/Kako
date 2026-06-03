import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { OnboardingWizard } from './onboarding-wizard';

/**
 * Company Onboarding Wizard — /platform/onboarding.
 *
 * Platform-Owner-ONLY guided company creation. The gate mirrors the same
 * `ctx.isPlatformOwner` check the server action (createCompanyOnboarding)
 * enforces, so a non-owner can never reach the wizard nor the write path.
 */
export default async function OnboardingPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t } = await getT();

  if (!ctx.isPlatformOwner) {
    return (
      <div>
        <PageHeader title={t('onboarding.title')} />
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {t('onboarding.ownerOnly')}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={t('onboarding.title')} description={t('onboarding.description')} />
      <OnboardingWizard />
    </div>
  );
}
