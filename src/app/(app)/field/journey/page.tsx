import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { BackLink } from '@/components/shared/back-link';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { MOBILE_ENABLED } from '@/lib/offline-sync';
import { getFeatureFlags } from '@/lib/erp/feature-flags';
import { visitDrivenRouteEnabled } from '@/lib/van-sales/sell';
import { isVanSalesActive } from '@/lib/van-sales/settings-server';
import { loadTodayJourney } from '../actions';
import { JourneyScreen } from './journey-screen';

/** ── Today's Journey (field) ───────────────────────────────────────────────
 *  Server component: guards field.sales, resolves the caller's open work
 *  session (creating one for today when needed) and hands the planned stops to
 *  the mobile-first client screen. */
export default async function FieldJourneyPage({ searchParams }: { searchParams: Promise<{ endday?: string }> }) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { endday } = await searchParams;

  const { t } = await getT();

  if (!hasPermission(ctx, 'field.sales')) {
    return (
      <div>
        <PageHeader title={t('fmcg.journeyTitle')} />
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {t('fmcg.notPermitted')}
          </CardContent>
        </Card>
      </div>
    );
  }

  const result = await loadTodayJourney();
  if (!result.ok || !result.data) {
    return (
      <div>
        <PageHeader title={t('fmcg.journeyTitle')} />
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {result.error === 'no_branch' || result.error === 'no_company'
              ? t('fmcg.noCompany')
              : t('fmcg.error')}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Visit-driven route (Phase 1, flag-gated): each stop opens the customer visit
  // context. Only when the flag is on AND Van Sales is active for the tenant.
  const supabase = await createClient();
  const flags = ctx.companyId ? await getFeatureFlags(supabase, ctx.companyId) : null;
  const visitDriven = visitDrivenRouteEnabled(flags) && (await isVanSalesActive(supabase, ctx));

  return (
    <div className="space-y-4">
      <BackLink href="/today" label={t('common.back')} />
      <JourneyScreen
        data={result.data}
        canOverrideGps={hasPermission(ctx, 'visit.override_gps')}
        offlineEnabled={MOBILE_ENABLED()}
        canAttachMedia={hasPermission(ctx, 'field.attach_media')}
        visitDriven={visitDriven}
        autoEndDay={endday === '1'}
      />
    </div>
  );
}
