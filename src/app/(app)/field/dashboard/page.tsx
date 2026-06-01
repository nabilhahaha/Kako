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

  const Kpi = ({ label, value }: { label: string; value: string | number }) => (
    <Card><CardContent className="p-4"><p className="text-2xl font-semibold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></CardContent></Card>
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
