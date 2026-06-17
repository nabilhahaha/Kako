import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Play, MapPin, ShieldCheck, AlertTriangle, HeartPulse, Receipt, FileText, User, CheckCircle2 } from 'lucide-react';
import { getUserContext } from '@/lib/erp/auth-context';
import { getT } from '@/lib/i18n/server';
import { hasPermission } from '@/lib/erp/permissions';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard, type StatTone } from '@/components/shared/stat-card';
import { EmptyState } from '@/components/shared/empty-state';
import { QuickNav, type QuickLink } from '@/components/home/home-widgets';
import { BackLink } from '@/components/shared/back-link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { loadTodayJourney } from '@/app/(app)/field/actions';
import { coachingData } from '@/app/(app)/home-actions';
import { routeCompletion, missedStops, nextStop, gpsComplianceRate, routeHealth, type RouteHealthBand } from '@/lib/erp/route-exec';

// Route Execution — the salesman's "My Day" overview: completion, GPS compliance,
// missed customers, route health, and the next customer with one-tap actions.
// Reuses the existing journey data (loadTodayJourney) + visit metrics
// (coachingData) + the pure route-exec lib. The detailed GPS check-in lives in
// /field/journey (linked). Additive; no schema change; degrades to an empty
// state where journey data isn't present (production drift).

const BAND_TONE: Record<RouteHealthBand, StatTone> = { good: 'success', attention: 'warning', critical: 'destructive', none: 'info' };

export default async function RouteExecutionPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const allowed = ctx.isPlatformOwner || ctx.isSuperAdmin || hasPermission(ctx, 'field.sales') || ctx.memberships.some((m) => m.role === 'salesman' || m.role === 'admin' || m.role === 'manager' || m.role === 'supervisor');
  if (!allowed) redirect('/dashboard');

  const { t, locale } = await getT();
  const pick = (en: string | null | undefined, ar: string | null | undefined) => (locale === 'ar' ? ar || en : en) ?? '—';

  const [jRes, cRes] = await Promise.all([loadTodayJourney(), coachingData()]);
  const stops = jRes.ok && jRes.data ? jRes.data.stops : [];
  const visited = jRes.ok && jRes.data ? jRes.data.visited : [];
  const gpsViolations = cRes.ok && cRes.data ? cRes.data.gpsViolations ?? 0 : 0;
  const outOfRoute = cRes.ok && cRes.data ? cRes.data.outOfRoute ?? 0 : 0;

  const completion = routeCompletion(stops, visited);
  const next = nextStop(stops, visited);
  const remaining = missedStops(stops, visited);
  const gpsRate = gpsComplianceRate(completion.visited, gpsViolations);
  const health = routeHealth(completion.pct, gpsViolations, outOfRoute);
  const visitedSet = new Set(visited);

  return (
    <div className="space-y-6">
      <BackLink href="/today" label={t('common.back')} />
      <PageHeader title={t('routeexec.title')} description={t('routeexec.subtitle')} />

      {/* Single primary action — the detailed GPS check-in journey. */}
      <Link href="/field/journey" className="flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-4 text-base font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90">
        <Play className="h-5 w-5 rtl:rotate-180" />
        {t('routeexec.openJourney')}
      </Link>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label={t('routeexec.completion')} value={`${completion.pct}%`} icon={MapPin} tone={BAND_TONE[health.band]} hint={`${completion.visited}/${completion.planned}`} />
        <StatCard label={t('routeexec.gpsCompliance')} value={`${gpsRate}%`} icon={ShieldCheck} tone={gpsRate >= 90 ? 'success' : gpsRate >= 70 ? 'warning' : 'destructive'} />
        <StatCard label={t('routeexec.missed')} value={String(completion.remaining)} icon={AlertTriangle} tone={completion.remaining > 0 ? 'warning' : 'success'} />
        <StatCard label={t('routeexec.health')} value={`${health.score}%`} icon={HeartPulse} tone={BAND_TONE[health.band]} />
      </div>

      {/* Next customer + one-tap actions */}
      {next ? (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('routeexec.nextCustomer')}</p>
              <p className="text-base font-semibold">{pick(next.customer_name, next.customer_name_ar)}</p>
              {next.address ? <p className="text-xs text-muted-foreground">{next.address}</p> : null}
              {next.planned_time ? <p className="text-xs text-muted-foreground" dir="ltr">{t('routeexec.plannedAt')} {next.planned_time}</p> : null}
            </div>
            <QuickNav links={[
              { label: t('routeexec.checkIn'), href: '/field/journey', icon: MapPin },
              { label: t('salesman.actNewInvoice'), href: '/sales/invoices', icon: Receipt },
              { label: t('salesman.actCustomer'), href: `/customers/${next.customer_id}/360`, icon: User },
              { label: t('salesman.actPrintStatement'), href: `/customers/${next.customer_id}/statement/print`, icon: FileText },
            ] satisfies QuickLink[]} />
          </CardContent>
        </Card>
      ) : stops.length > 0 ? (
        <div className="flex items-center gap-2 rounded-lg border bg-success/5 p-4 text-sm text-success">
          <CheckCircle2 className="h-5 w-5" />
          {t('routeexec.routeComplete')}
        </div>
      ) : null}

      {/* Route stops */}
      {stops.length === 0 ? (
        <EmptyState icon={<MapPin />} title={t('routeexec.noRoute')} description={t('routeexec.noRouteNote')} />
      ) : (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t('routeexec.stops')}</h2>
          <ul className="space-y-2">
            {stops.map((s) => {
              const done = visitedSet.has(s.customer_id);
              return (
                <li key={s.plan_id}>
                  <Card>
                    <CardContent className="flex items-center justify-between gap-3 p-3">
                      <span className="flex items-center gap-2.5">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold tabular-nums">{s.sequence}</span>
                        <span className="text-sm font-medium">{pick(s.customer_name, s.customer_name_ar)}</span>
                      </span>
                      <Badge variant={done ? 'success' : 'secondary'}>{done ? t('routeexec.visited') : t('routeexec.pending')}</Badge>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
