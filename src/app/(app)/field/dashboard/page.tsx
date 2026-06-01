import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, ChevronLeft, MapPin } from 'lucide-react';
import { getT } from '@/lib/i18n/server';
import { DashboardFilters } from './dashboard-filters';
import { TrendChart, TREND_COLORS } from '@/components/field/trend-chart';

interface Summary {
  today: { visits: number; completed: number; in_progress: number; geofence_ok: number; geofence_violations: number; customers_covered: number; avg_duration_min: number };
  alerts: { visit_id: string; type: string; customer: string; customer_id: string; distance_m: number | null; reason: string | null; rep: string | null; at: string }[];
  routes: { route: string; route_id: string | null; visits: number; completed: number; violations: number }[];
}
interface CovTotals { planned: number; visited: number; missed: number; off_plan: number; coverage_pct: number; compliance_pct: number }
interface CovResult { totals: CovTotals; groups: { key: string; planned: number; visited: number; missed: number; off_plan: number; coverage_pct: number; compliance_pct: number }[] }
interface CovLists { missed: { customer: string; customer_id: string; route: string | null; plan_date: string }[]; due_soon: { customer: string; customer_id: string; next_due: string; frequency: string }[] }
interface ExecScore { merch_compliance: number | null; survey_score: number | null; oos_score: number | null; opportunity_score: number | null; overall: number | null; captures: number }
interface ExecGroup extends ExecScore { id: string | null; name: string }
function iso(d: Date): string { return d.toISOString().slice(0, 10); }

/** Manager Field dashboard (FE-2e): today KPIs, prioritized geofence alerts and
 *  route-level visibility. Server-rendered, mobile-friendly. The data seam
 *  (erp_fe_manager_summary) is what the richer FE-5 dashboards extend. */
export default async function FieldDashboardPage({ searchParams }: { searchParams: Promise<{ view?: string; route?: string; rep?: string }> }) {
  const { view: viewParam, route: routeParam, rep: repParam } = await searchParams;
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('erp_fe_manager_summary');
  if (error || !data) {
    return (
      <div>
        <PageHeader title={t('field.dashboard.title')} />
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t('field.dashboard.noAccess')}</CardContent></Card>
      </div>
    );
  }
  const s = data as Summary;
  const total = s.today.geofence_ok + s.today.geofence_violations;
  const compliance = total > 0 ? Math.round((s.today.geofence_ok / total) * 100) : 100;

  // Filters: view (daily/weekly/monthly) → bucket + span; route + rep.
  const today = new Date();
  const view = viewParam === 'daily' || viewParam === 'monthly' ? viewParam : 'weekly';
  const route = routeParam || null;
  const rep = repParam || null;
  const bucket = view === 'daily' ? 'day' : view === 'monthly' ? 'month' : 'week';
  const spanDays = view === 'daily' ? 14 : view === 'monthly' ? 365 : 84;
  const fromDate = new Date(today); fromDate.setDate(fromDate.getDate() - (spanDays - 1)); fromDate.setHours(0, 0, 0, 0);
  const fromTs = fromDate.toISOString();

  const d7 = new Date(today); d7.setDate(d7.getDate() - 6);
  const d30 = new Date(today); d30.setDate(d30.getDate() - 29);
  const d30ts = new Date(d30); d30ts.setHours(0, 0, 0, 0);
  const execScoped = route ? { p_scope: 'route', p_id: route, p_from: fromTs } : rep ? { p_scope: 'rep', p_id: rep, p_from: fromTs } : { p_scope: 'company', p_id: null, p_from: fromTs };
  const [daily, weekly, monthly, byRoute, byRep, lists, execCo, execRoutes, execReps, covTrend, scoreTrend, routeRows] = await Promise.all([
    supabase.rpc('erp_fe_coverage', { p_from: iso(today), p_to: iso(today), p_group: 'total' }),
    supabase.rpc('erp_fe_coverage', { p_from: iso(d7), p_to: iso(today), p_group: 'total' }),
    supabase.rpc('erp_fe_coverage', { p_from: iso(d30), p_to: iso(today), p_group: 'total' }),
    supabase.rpc('erp_fe_coverage', { p_from: iso(d30), p_to: iso(today), p_group: 'route' }),
    supabase.rpc('erp_fe_coverage', { p_from: iso(d30), p_to: iso(today), p_group: 'rep' }),
    supabase.rpc('erp_fe_coverage_lists', { p_days: 7 }),
    supabase.rpc('erp_fe_execution_scores', execScoped),
    supabase.rpc('erp_fe_execution_scores_by', { p_group: 'route', p_from: d30ts.toISOString() }),
    supabase.rpc('erp_fe_execution_scores_by', { p_group: 'rep', p_from: d30ts.toISOString() }),
    supabase.rpc('erp_fe_coverage_trend', { p_from: iso(fromDate), p_to: iso(today), p_bucket: bucket, p_route: route, p_rep: rep }),
    supabase.rpc('erp_fe_score_trend', { p_from: iso(fromDate), p_to: iso(today), p_bucket: bucket, p_route: route, p_rep: rep }),
    supabase.from('erp_routes').select('id, name').eq('is_active', true).order('name'),
  ]);
  const covTrendData = (covTrend.data as Record<string, unknown>[] | null) ?? [];
  const scoreTrendData = (scoreTrend.data as Record<string, unknown>[] | null) ?? [];
  const routeOpts = ((routeRows.data as { id: string; name: string }[] | null) ?? []);
  const exec = { company: execCo.data as ExecScore | null, routes: (execRoutes.data as ExecGroup[] | null) ?? [], reps: (execReps.data as ExecGroup[] | null) ?? [] };
  const repOpts = exec.reps.filter((r) => r.id).map((r) => ({ id: r.id as string, name: r.name }));
  const cov = {
    daily: (daily.data as CovResult | null)?.totals, weekly: (weekly.data as CovResult | null)?.totals, monthly: (monthly.data as CovResult | null)?.totals,
    byRoute: (byRoute.data as CovResult | null)?.groups ?? [], byRep: (byRep.data as CovResult | null)?.groups ?? [],
  };
  const cl = (lists.data as CovLists | null) ?? { missed: [], due_soon: [] };

  const Kpi = ({ label, value }: { label: string; value: string | number }) => (
    <Card><CardContent className="p-4"><p className="text-2xl font-semibold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></CardContent></Card>
  );
  const CovCard = ({ label, c }: { label: string; c?: CovTotals }) => (
    <Card><CardContent className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold">{c?.coverage_pct ?? 0}%</p>
      <p className="text-xs text-muted-foreground">{t('field.dashboard.compliancePct')} {c?.compliance_pct ?? 0}% · {c?.visited ?? 0}/{c?.planned ?? 0}</p>
    </CardContent></Card>
  );
  // Full component breakdown badges — the score is drillable everywhere.
  const Breakdown = ({ e }: { e: ExecScore }) => (
    <span className="flex flex-wrap items-center gap-1.5 text-xs">
      <Badge variant="outline">{t('field.dashboard.merch')} {e.merch_compliance ?? '—'}</Badge>
      <Badge variant="outline">{t('field.dashboard.survey')} {e.survey_score ?? '—'}</Badge>
      <Badge variant="outline">{t('field.dashboard.oos')} {e.oos_score ?? '—'}</Badge>
      <Badge variant="outline">{t('field.dashboard.opp')} {e.opportunity_score ?? '—'}</Badge>
    </span>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PageHeader title={t('field.dashboard.title')} description={t('field.dashboard.today')} />
        <div className="flex items-center gap-3">
          <Link href="/field/alerts" className="text-xs font-medium text-primary hover:underline">{t('field.alerts.title')}</Link>
          {(ctx.isPlatformOwner || ctx.isSuperAdmin || ctx.topRole === 'admin') && (
            <Link href="/field/weights" className="text-xs font-medium text-primary hover:underline">{t('field.weights.title')}</Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Kpi label={t('field.dashboard.visits')} value={s.today.visits} />
        <Kpi label={t('field.dashboard.completed')} value={s.today.completed} />
        <Kpi label={t('field.dashboard.inProgress')} value={s.today.in_progress} />
        <Kpi label={t('field.dashboard.covered')} value={s.today.customers_covered} />
        <Kpi label={t('field.dashboard.compliance')} value={`${compliance}%`} />
        <Kpi label={t('field.dashboard.avgDuration')} value={`${s.today.avg_duration_min} ${t('field.dashboard.min')}`} />
      </div>

      {/* Filters + trends */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">{t('field.dashboard.trends')}</h3>
          <DashboardFilters view={view} route={route} rep={rep} routes={routeOpts} reps={repOpts} />
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Card><CardContent className="p-3">
            <p className="mb-1 text-xs font-medium text-muted-foreground">{t('field.dashboard.coverageTrend')}</p>
            <TrendChart data={covTrendData} series={[
              { key: 'coverage_pct', label: t('field.dashboard.coveragePct'), color: TREND_COLORS.coverage },
              { key: 'compliance_pct', label: t('field.dashboard.compliancePct'), color: TREND_COLORS.compliance },
            ]} />
          </CardContent></Card>
          <Card><CardContent className="p-3">
            <p className="mb-1 text-xs font-medium text-muted-foreground">{t('field.dashboard.scoreTrend')}</p>
            <TrendChart data={scoreTrendData} series={[
              { key: 'overall', label: t('field.score.overall'), color: TREND_COLORS.overall },
              { key: 'merch_compliance', label: t('field.dashboard.merch'), color: TREND_COLORS.merch },
              { key: 'oos_score', label: t('field.dashboard.oos'), color: TREND_COLORS.oos },
              { key: 'opportunity_score', label: t('field.dashboard.opp'), color: TREND_COLORS.opportunity },
            ]} />
          </CardContent></Card>
          <Card><CardContent className="p-3">
            <p className="mb-1 text-xs font-medium text-muted-foreground">{t('field.dashboard.captureTrend')}</p>
            <TrendChart data={scoreTrendData} series={[
              { key: 'merch_count', label: t('field.dashboard.merch'), color: TREND_COLORS.merch },
              { key: 'competitor_count', label: t('field.capture.kinds.competitor'), color: TREND_COLORS.competitor },
              { key: 'oos_count', label: t('field.dashboard.oos'), color: TREND_COLORS.oos },
              { key: 'opportunity_count', label: t('field.dashboard.opp'), color: TREND_COLORS.opportunity },
            ]} />
          </CardContent></Card>
        </div>
      </div>

      {/* Coverage (daily / weekly / monthly) */}
      <div>
        <h3 className="mb-2 font-semibold">{t('field.dashboard.coverageTitle')}</h3>
        <div className="grid grid-cols-3 gap-3">
          <CovCard label={t('field.dashboard.daily')} c={cov.daily} />
          <CovCard label={t('field.dashboard.weekly')} c={cov.weekly} />
          <CovCard label={t('field.dashboard.monthly')} c={cov.monthly} />
        </div>
      </div>

      {/* Coverage by route / rep (30d) */}
      <div className="grid gap-4 sm:grid-cols-2">
        {([['byRoute', cov.byRoute], ['byRep', cov.byRep]] as const).map(([label, groups]) => (
          <div key={label}>
            <h3 className="mb-2 font-semibold">{t(`field.dashboard.${label}`)}</h3>
            {groups.length === 0 ? <Card><CardContent className="p-4 text-center text-sm text-muted-foreground">{t('field.dashboard.none')}</CardContent></Card>
              : <Card><CardContent className="divide-y p-0">
                  {groups.map((g) => (
                    <div key={g.key} className="flex items-center justify-between gap-2 p-3 text-sm">
                      <span className="min-w-0 truncate font-medium">{g.key}</span>
                      <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="secondary">{g.coverage_pct}% {t('field.dashboard.coveragePct')}</Badge>
                        <Badge variant="outline">{g.compliance_pct}% {t('field.dashboard.compliancePct')}</Badge>
                        {g.missed > 0 && <Badge variant="outline" className="text-amber-600">{g.missed} {t('field.dashboard.missedCustomers')}</Badge>}
                      </span>
                    </div>
                  ))}
                </CardContent></Card>}
          </div>
        ))}
      </div>

      {/* Execution score (company + route + rep), fully drillable */}
      <div>
        <h3 className="mb-2 font-semibold">{t('field.dashboard.execTitle')}</h3>
        {exec.company && exec.company.captures > 0 ? (
          <Link href="/field/perf/company/all" className="mb-3 block">
            <Card className="transition-colors hover:border-primary"><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <span className="flex items-center gap-3"><span className="text-3xl font-semibold">{exec.company.overall ?? '—'}</span><span className="text-xs text-muted-foreground">{t('field.score.overall')}</span></span>
              <span className="flex items-center gap-2"><Breakdown e={exec.company} /><ChevronLeft className="h-4 w-4 text-muted-foreground rtl:rotate-180" /></span>
            </CardContent></Card>
          </Link>
        ) : <Card className="mb-3"><CardContent className="p-4 text-center text-sm text-muted-foreground">{t('field.dashboard.none')}</CardContent></Card>}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <h4 className="mb-2 text-sm font-medium text-muted-foreground">{t('field.dashboard.execByRoute')}</h4>
            {exec.routes.length === 0 ? <Card><CardContent className="p-4 text-center text-sm text-muted-foreground">{t('field.dashboard.none')}</CardContent></Card>
              : <div className="space-y-2">{exec.routes.map((g, i) => (
                  <Link key={g.id ?? i} href={g.id ? `/field/perf/route/${g.id}` : '#'}><Card className="transition-colors hover:border-primary"><CardContent className="space-y-1 p-3 text-sm">
                    <div className="flex items-center justify-between"><span className="min-w-0 truncate font-medium">{g.name}</span><span className="flex items-center gap-1"><Badge variant="secondary">{g.overall ?? '—'}</Badge><ChevronLeft className="h-3.5 w-3.5 text-muted-foreground rtl:rotate-180" /></span></div>
                    <Breakdown e={g} />
                  </CardContent></Card></Link>
                ))}</div>}
          </div>
          <div>
            <h4 className="mb-2 text-sm font-medium text-muted-foreground">{t('field.dashboard.execByRep')}</h4>
            {exec.reps.length === 0 ? <Card><CardContent className="p-4 text-center text-sm text-muted-foreground">{t('field.dashboard.none')}</CardContent></Card>
              : <div className="space-y-2">{exec.reps.map((g, i) => (
                  <Link key={g.id ?? i} href={g.id ? `/field/perf/rep/${g.id}` : '#'}><Card className="transition-colors hover:border-primary"><CardContent className="space-y-1 p-3 text-sm">
                    <div className="flex items-center justify-between"><span className="min-w-0 truncate font-medium">{g.name}</span><span className="flex items-center gap-1"><Badge variant="secondary">{g.overall ?? '—'}</Badge><ChevronLeft className="h-3.5 w-3.5 text-muted-foreground rtl:rotate-180" /></span></div>
                    <Breakdown e={g} />
                  </CardContent></Card></Link>
                ))}</div>}
          </div>
        </div>
      </div>

      {/* Missed customers + Due soon (drill-through) */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="mb-2 font-semibold">{t('field.dashboard.missedCustomers')}</h3>
          {cl.missed.length === 0 ? <Card><CardContent className="p-4 text-center text-sm text-muted-foreground">{t('field.dashboard.none')}</CardContent></Card>
            : <div className="space-y-2">{cl.missed.map((m, i) => (
                <Link key={`${m.customer_id}-${i}`} href={`/field/customers/${m.customer_id}`}><Card className="transition-colors hover:border-primary"><CardContent className="flex items-center justify-between gap-2 p-3 text-sm">
                  <span className="min-w-0"><span className="block truncate font-medium">{m.customer}</span><span className="text-xs text-muted-foreground">{m.route ?? '—'} · {String(m.plan_date).slice(0, 10)}</span></span>
                  <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground rtl:rotate-180" />
                </CardContent></Card></Link>
              ))}</div>}
        </div>
        <div>
          <h3 className="mb-2 font-semibold">{t('field.dashboard.dueSoon')}</h3>
          {cl.due_soon.length === 0 ? <Card><CardContent className="p-4 text-center text-sm text-muted-foreground">{t('field.dashboard.none')}</CardContent></Card>
            : <div className="space-y-2">{cl.due_soon.map((d, i) => (
                <Link key={`${d.customer_id}-${i}`} href={`/field/customers/${d.customer_id}`}><Card className="transition-colors hover:border-primary"><CardContent className="flex items-center justify-between gap-2 p-3 text-sm">
                  <span className="min-w-0"><span className="block truncate font-medium">{d.customer}</span><span className="text-xs text-muted-foreground">{t('field.dashboard.nextDue')}: {String(d.next_due).slice(0, 10)} · {d.frequency}</span></span>
                  <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground rtl:rotate-180" />
                </CardContent></Card></Link>
              ))}</div>}
        </div>
      </div>

      {/* Prioritized alerts */}
      <div>
        <h3 className="mb-2 flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4 text-amber-600" /> {t('field.dashboard.alerts')}</h3>
        {s.alerts.length === 0 ? (
          <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">{t('field.dashboard.noAlerts')}</CardContent></Card>
        ) : (
          <div className="space-y-2">
            {s.alerts.map((a) => (
              <Link key={a.visit_id} href={`/field/customers/${a.customer_id}`}>
                <Card className="transition-colors hover:border-primary">
                  <CardContent className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{a.customer}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <Badge variant="outline" className="gap-1 text-amber-600"><AlertTriangle className="h-3 w-3" />{a.distance_m != null ? `${Math.round(a.distance_m)} ${t('field.dashboard.metersFromStore')}` : '—'}</Badge>
                        {a.rep && <span>· {a.rep}</span>}
                        {a.reason && <span className="truncate">· {a.reason}</span>}
                      </div>
                    </div>
                    <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground rtl:rotate-180" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Route-level visibility */}
      <div>
        <h3 className="mb-2 flex items-center gap-2 font-semibold"><MapPin className="h-4 w-4" /> {t('field.dashboard.routes')}</h3>
        {s.routes.length === 0 ? (
          <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">{t('field.dashboard.noRoutes')}</CardContent></Card>
        ) : (
          <Card><CardContent className="divide-y p-0">
            {s.routes.map((r, i) => (
              <div key={r.route_id ?? `r${i}`} className="flex items-center justify-between p-4 text-sm">
                <span className="font-medium">{r.route}</span>
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Badge variant="secondary">{r.visits} {t('field.dashboard.visits')}</Badge>
                  {r.violations > 0 && <Badge variant="outline" className="text-amber-600">{r.violations} {t('field.dashboard.violations')}</Badge>}
                </span>
              </div>
            ))}
          </CardContent></Card>
        )}
      </div>
    </div>
  );
}
