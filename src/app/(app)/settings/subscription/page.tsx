import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { SubscriptionRequestForm, type PlanOpt } from './request-form';

/** ── Subscription change request (tenant side) ─────────────────────────────
 *  Company admins raise a subscription change; it routes through the platform
 *  approval workflow (Billing review → Owner). Status is tracked in /requests. */
export default async function SubscriptionRequestPage() {
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const isAdmin = ctx.memberships.some((m) => m.role === 'admin');
  if (!isAdmin) {
    return (
      <div>
        <PageHeader title={t('subscriptionRequest.title')} />
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">{t('subscriptionRequest.adminOnly')}</CardContent>
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
      <PageHeader title={t('subscriptionRequest.title')} description={t('subscriptionRequest.subtitle')} />
      <SubscriptionRequestForm plans={(plans as PlanOpt[]) ?? []} />
    </div>
  );
}
