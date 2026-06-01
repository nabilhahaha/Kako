import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, ChevronLeft, MapPin } from 'lucide-react';
import { getT } from '@/lib/i18n/server';

interface Summary {
  today: { visits: number; completed: number; in_progress: number; geofence_ok: number; geofence_violations: number; customers_covered: number; avg_duration_min: number };
  alerts: { visit_id: string; type: string; customer: string; customer_id: string; distance_m: number | null; reason: string | null; rep: string | null; at: string }[];
  routes: { route: string; route_id: string | null; visits: number; completed: number; violations: number }[];
}
interface CovTotals { planned: number; visited: number; missed: number; off_plan: number; coverage_pct: number; compliance_pct: number }
interface CovResult { totals: CovTotals; groups: { key: string; planned: number; visited: number; missed: number; off_plan: number; coverage_pct: number; compliance_pct: number }[] }
interface CovLists { missed: { customer: string; customer_id: string; route: string | null; plan_date: string }[]; due_soon: { customer: string; customer_id: string; next_due: string; frequency: string }[] }
function iso(d: Date): string { return d.toISOString().slice(0, 10); }

/** Manager Field dashboard (FE-2e): today KPIs, prioritized geofence alerts and
 *  route-level visibility. Server-rendered, mobile-friendly. The data seam
 *  (erp_fe_manager_summary) is what the richer FE-5 dashboards extend. */
export default async function FieldDashboardPage() {
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

  // Coverage windows: daily = today, weekly = last 7d, monthly = last 30d.
  const today = new Date();
  const d7 = new Date(today); d7.setDate(d7.getDate() - 6);
  const d30 = new Date(today); d30.setDate(d30.getDate() - 29);
  const [daily, weekly, monthly, byRoute, byRep, lists] = await Promise.all([
    supabase.rpc('erp_fe_coverage', { p_from: iso(today), p_to: iso(today), p_group: 'total' }),
    supabase.rpc('erp_fe_coverage', { p_from: iso(d7), p_to: iso(today), p_group: 'total' }),
    supabase.rpc('erp_fe_coverage', { p_from: iso(d30), p_to: iso(today), p_group: 'total' }),
    supabase.rpc('erp_fe_coverage', { p_from: iso(d30), p_to: iso(today), p_group: 'route' }),
    supabase.rpc('erp_fe_coverage', { p_from: iso(d30), p_to: iso(today), p_group: 'rep' }),
    supabase.rpc('erp_fe_coverage_lists', { p_days: 7 }),
  ]);
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

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title={t('field.dashboard.title')} description={t('field.dashboard.today')} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Kpi label={t('field.dashboard.visits')} value={s.today.visits} />
        <Kpi label={t('field.dashboard.completed')} value={s.today.completed} />
        <Kpi label={t('field.dashboard.inProgress')} value={s.today.in_progress} />
        <Kpi label={t('field.dashboard.covered')} value={s.today.customers_covered} />
        <Kpi label={t('field.dashboard.compliance')} value={`${compliance}%`} />
        <Kpi label={t('field.dashboard.avgDuration')} value={`${s.today.avg_duration_min} ${t('field.dashboard.min')}`} />
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
