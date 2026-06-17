import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { loadOnboardingState } from '@/lib/onboarding/state-server';
import { ONBOARDING_STEPS } from '@/lib/onboarding/state';
import { GoLiveChecklist } from './go-live-checklist';

/**
 * "Setup & Go-Live" — the cohesive onboarding cockpit. Surfaces the existing
 * onboarding-state engine (erp_onboarding_state, Phase 1) as a readiness
 * checklist: every step deep-links to its already-existing configuration screen
 * (incl. the new Organization/Product/Numbering/Finance builders), and the
 * Go-Live action reuses completeOnboarding() (which flips erp_companies.setup_done).
 * No new tables; cards + progress rail per the Back Office UX standard.
 */
export default async function GoLivePage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  // Same capability gate as the onboarding-state server actions, so the
  // checklist's save/complete actions are guaranteed to succeed for the viewer.
  if (!hasPermission(ctx, 'integrations.manage')) {
    const { t } = await getT();
    return (
      <div>
        <PageHeader title={t('goLive.pageTitle')} />
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {t('goLive.adminOnly')}
          </CardContent>
        </Card>
      </div>
    );
  }

  const { t } = await getT();
  const res = await loadOnboardingState();
  const stepStatus = res.ok && res.data ? res.data.stepStatus : {};
  const completedAt = res.ok && res.data ? res.data.completedAt : null;

  return (
    <div>
      <PageHeader title={t('goLive.pageTitle')} description={t('goLive.pageDescription')} />
      <GoLiveChecklist
        steps={ONBOARDING_STEPS}
        initialStatus={stepStatus}
        completedAt={completedAt}
      />
    </div>
  );
}
