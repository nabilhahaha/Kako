import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { OnboardingForm, type PlanOpt } from './onboarding-form';

/** ── Onboarding request (tenant side) ──────────────────────────────────────
 *  Company admins request provisioning (plan + optional trial); it routes
 *  through the platform onboarding workflow. Tracked in /requests. */
export default async function OnboardingRequestPage() {
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const isAdmin = ctx.memberships.some((m) => m.role === 'admin');
  if (!isAdmin) {
    return (
      <div>
        <PageHeader title={t('onboardingRequest.title')} />
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">{t('onboardingRequest.adminOnly')}</CardContent>
        </Card>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: plans } = await supabase
    .from('erp_plans')
    .select('key, name_ar, name_en')
    .order('rank', { ascending: true });

  return (
    <div>
      <PageHeader title={t('onboardingRequest.title')} description={t('onboardingRequest.subtitle')} />
      <OnboardingForm plans={(plans as PlanOpt[]) ?? []} />
    </div>
  );
}
