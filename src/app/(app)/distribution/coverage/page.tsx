import { notFound, redirect } from 'next/navigation';
import { Target, Route as RouteIcon, Zap, MapPin, MapPinOff } from 'lucide-react';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { getT } from '@/lib/i18n/server';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { Card, CardContent } from '@/components/ui/card';
import { DISTRIBUTION_ENABLED } from '@/lib/distribution/flags';
import { rollupCoverage, type CoverageKpis } from '@/lib/distribution/coverage/kpi';

interface KpiRow {
  salesman_id: string;
  planned: number; visited: number; planned_visited: number; missed: number;
  off_route: number; productive: number;
  coverage_pct: number; adherence_pct: number; strike_rate_pct: number;
}

/**
 * Coverage & Supervisor Monitoring dashboard — reads the persisted rep-day KPI
 * snapshots (erp_rep_day_kpis, 0193) for a day and surfaces team coverage,
 * adherence, and strike rate. Branch-RLS scoped. INERT by default: gated by
 * KAKO_DISTRIBUTION (notFound when off) on top of the distribution module guard.
 */
export default async function CoverageDashboard({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!DISTRIBUTION_ENABLED()) notFound();
  if (!hasPermission(ctx, 'reports.view')) redirect('/dashboard');

  const { t } = await getT();
  const sp = await searchParams;
  const supabase = await createClient();

  // Date: explicit ?date= or the most recent snapshot date in scope (RLS-bounded).
  let date = (sp.date ?? '').trim();
  if (!date) {
    const { data: latest } = await supabase
      .from('erp_rep_day_kpis').select('kpi_date').order('kpi_date', { ascending: false }).limit(1).maybeSingle();
    date = (latest as { kpi_date?: string } | null)?.kpi_date ?? new Date().toISOString().slice(0, 10);
  }

  const { data } = await supabase
    .from('erp_rep_day_kpis')
    .select('salesman_id, planned, visited, planned_visited, missed, off_route, productive, coverage_pct, adherence_pct, strike_rate_pct')
    .eq('kpi_date', date)
    .order('coverage_pct', { ascending: false });
  const rows = (data ?? []) as KpiRow[];

  // Resolve rep names (best-effort; falls back to a generic label).
  const names = new Map<string, string>();
  if (rows.length > 0) {
    const { data: profiles } = await supabase
      .from('erp_profiles').select('user_id, full_name').in('user_id', rows.map((r) => r.salesman_id));
    for (const p of (profiles ?? []) as Array<{ user_id: string; full_name: string | null }>) {
      if (p.full_name) names.set(p.user_id, p.full_name);
    }
  }

  const asKpis: CoverageKpis[] = rows.map((r) => ({
    planned: r.planned, visited: r.visited, plannedVisited: r.planned_visited, missed: r.missed,
    offRoute: r.off_route, productive: r.productive,
    coveragePct: r.coverage_pct, adherencePct: r.adherence_pct, strikeRatePct: r.strike_rate_pct,
  }));
  const total = rollupCoverage(asKpis);

  return (
    <div className="space-y-6">
      <PageHeader title={t('distribution.coverageTitle')} description={`${t('distribution.coverageDescription')} · ${t('distribution.coverageAsOf')} ${date}`} />

      {rows.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">{t('distribution.coverageEmpty')}</CardContent></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <StatCard label={t('distribution.kpiCoverage')} value={`${total.coveragePct}%`} icon={Target} tone={total.coveragePct >= 90 ? 'success' : total.coveragePct >= 70 ? 'warning' : 'destructive'} />
            <StatCard label={t('distribution.kpiAdherence')} value={`${total.adherencePct}%`} icon={RouteIcon} tone="info" />
            <StatCard label={t('distribution.kpiStrikeRate')} value={`${total.strikeRatePct}%`} icon={Zap} tone="primary" />
            <StatCard label={t('distribution.kpiVisited')} value={String(total.visited)} icon={MapPin} tone="info" hint={`${total.productive} ${t('distribution.kpiStrikeRate')}`} />
            <StatCard label={t('distribution.kpiMissed')} value={String(total.missed)} icon={MapPinOff} tone={total.missed > 0 ? 'warning' : 'success'} />
          </div>

          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="border-b text-muted-foreground">
                  <tr className="text-start">
                    <th className="p-3 text-start font-medium">{t('distribution.colRep')}</th>
                    <th className="p-3 text-end font-medium">{t('distribution.colPlanned')}</th>
                    <th className="p-3 text-end font-medium">{t('distribution.colVisited')}</th>
                    <th className="p-3 text-end font-medium">{t('distribution.colCoverage')}</th>
                    <th className="p-3 text-end font-medium">{t('distribution.colStrike')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.salesman_id} className="border-b last:border-0">
                      <td className="p-3">{names.get(r.salesman_id) ?? `${t('distribution.defaultRepName')} ${r.salesman_id.slice(0, 8)}`}</td>
                      <td className="p-3 text-end tabular-nums">{r.planned}</td>
                      <td className="p-3 text-end tabular-nums">{r.visited}</td>
                      <td className="p-3 text-end tabular-nums">{r.coverage_pct}%</td>
                      <td className="p-3 text-end tabular-nums">{r.strike_rate_pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
