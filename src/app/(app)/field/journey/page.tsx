import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { MOBILE_ENABLED } from '@/lib/offline-sync';
import { loadTodayJourney } from '../actions';
import { JourneyScreen } from './journey-screen';

/** ── Today's Journey (field) ───────────────────────────────────────────────
 *  Server component: guards field.sales, resolves the caller's open work
 *  session (creating one for today when needed) and hands the planned stops to
 *  the mobile-first client screen. */
export default async function FieldJourneyPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

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

  return (
    <JourneyScreen
      data={result.data}
      canOverrideGps={hasPermission(ctx, 'visit.override_gps')}
      offlineEnabled={MOBILE_ENABLED()}
    />
  );
}
