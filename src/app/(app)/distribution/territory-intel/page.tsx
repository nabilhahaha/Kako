import { redirect } from 'next/navigation';
import { Activity, User, Truck, Map as MapIcon } from 'lucide-react';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { getT } from '@/lib/i18n/server';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { EmptyState } from '@/components/shared/empty-state';
import { Card, CardContent } from '@/components/ui/card';
import { ROUTE_INTEL_ENABLED, salesmanDashboard, routeDashboard, territoryDashboard, type HealthRow } from '@/lib/route-intel';

export const dynamic = 'force-dynamic';

type Snapshot = {
  entity_type: string; entity_id: string; period: string; health_score: number; band: string | null;
  coverage_pct: number | null; strike_rate_pct: number | null; adherence_pct: number | null;
  missed_customers: number; territory_id: string | null; supervisor_id: string | null;
};

const avg = (ns: number[]): number => (ns.length ? Math.round(ns.reduce((s, n) => s + n, 0) / ns.length) : 0);

export default async function TerritoryIntelPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!hasPermission(ctx, 'reports.view')) redirect('/dashboard');

  const { t } = await getT();

  if (!ROUTE_INTEL_ENABLED()) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('distribution.intelTitle')} description={t('distribution.intelDescription')} />
        <EmptyState icon={<Activity className="h-7 w-7" />} title={t('distribution.intelDisabled')} />
      </div>
    );
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from('erp_intel_health_snapshots')
    .select('entity_type, entity_id, period, health_score, band, coverage_pct, strike_rate_pct, adherence_pct, missed_customers, territory_id, supervisor_id')
    .order('period', { ascending: false })
    .limit(1000);
  const all = (data ?? []) as Snapshot[];

  if (all.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('distribution.intelTitle')} description={t('distribution.intelDescription')} />
        <EmptyState icon={<Activity className="h-7 w-7" />} title={t('distribution.intelEmpty')} />
      </div>
    );
  }

  const latestPeriod = all[0].period;
  const rows: HealthRow[] = all.filter((r) => r.period === latestPeriod).map((r) => ({
    entityId: r.entity_id,
    entityType: (r.entity_type === 'route' || r.entity_type === 'territory' ? r.entity_type : 'salesman'),
    healthScore: Number(r.health_score),
    band: r.band ?? 'none',
    coveragePct: Number(r.coverage_pct ?? 0),
    strikeRatePct: Number(r.strike_rate_pct ?? 0),
    adherencePct: Number(r.adherence_pct ?? 0),
    missedCustomers: r.missed_customers ?? 0,
    territoryId: r.territory_id,
    supervisorId: r.supervisor_id,
    period: r.period,
  }));

  const salesmen = salesmanDashboard(rows);
  const routes = routeDashboard(rows);
  const territories = territoryDashboard(rows);

  // resolve salesman names
  const repNames = new Map<string, string>();
  const repIds = [...new Set(salesmen.map((r) => r.entityId))];
  if (repIds.length) {
    const { data: profs } = await supabase.from('erp_profiles').select('user_id, full_name').in('user_id', repIds);
    for (const p of profs ?? []) if (p.full_name) repNames.set(p.user_id as string, p.full_name as string);
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('distribution.intelTitle')} description={`${t('distribution.intelDescription')} · ${latestPeriod}`} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t('distribution.intelKpiSalesman')} value={String(avg(salesmen.map((r) => r.healthScore)))} icon={User} tone="primary" />
        <StatCard label={t('distribution.intelKpiRoute')} value={String(avg(routes.map((r) => r.healthScore)))} icon={Truck} tone="info" />
        <StatCard label={t('distribution.intelKpiTerritory')} value={String(avg(territories.map((tt) => tt.avgHealth)))} icon={MapIcon} tone="success" />
        <StatCard label={t('distribution.intelKpiCoverage')} value={`${avg(salesmen.map((r) => r.coveragePct))}%`} icon={Activity} tone="warning" />
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <h2 className="text-sm font-semibold">{t('distribution.intelSalesmanTitle')}</h2>
          <table className="w-full text-sm">
            <thead className="text-muted-foreground">
              <tr className="border-b">
                <th className="p-2 text-start">{t('distribution.intelColEntity')}</th>
                <th className="p-2 text-end">{t('distribution.intelColHealth')}</th>
                <th className="p-2 text-end">{t('distribution.intelColCoverage')}</th>
                <th className="p-2 text-end">{t('distribution.intelColStrike')}</th>
                <th className="p-2 text-end">{t('distribution.intelColMissed')}</th>
              </tr>
            </thead>
            <tbody>
              {salesmen.map((r) => (
                <tr key={r.entityId} className="border-b last:border-0">
                  <td className="p-2">{repNames.get(r.entityId) ?? r.entityId}</td>
                  <td className={`p-2 text-end font-medium ${r.healthScore < 50 ? 'text-destructive' : ''}`}>{r.healthScore}</td>
                  <td className="p-2 text-end">{r.coveragePct}%</td>
                  <td className="p-2 text-end">{r.strikeRatePct}%</td>
                  <td className="p-2 text-end">{r.missedCustomers}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {(routes.length > 0 || territories.length > 0) && (
        <div className="grid gap-6 lg:grid-cols-2">
          {routes.length > 0 && (
            <Card><CardContent className="space-y-3 p-4">
              <h2 className="text-sm font-semibold">{t('distribution.intelRouteTitle')}</h2>
              <table className="w-full text-sm">
                <thead className="text-muted-foreground"><tr className="border-b"><th className="p-2 text-start">{t('distribution.intelColEntity')}</th><th className="p-2 text-end">{t('distribution.intelColHealth')}</th><th className="p-2 text-end">{t('distribution.intelColCoverage')}</th></tr></thead>
                <tbody>{routes.map((r) => (<tr key={r.entityId} className="border-b last:border-0"><td className="p-2 font-mono text-xs">{r.entityId}</td><td className="p-2 text-end font-medium">{r.healthScore}</td><td className="p-2 text-end">{r.coveragePct}%</td></tr>))}</tbody>
              </table>
            </CardContent></Card>
          )}
          {territories.length > 0 && (
            <Card><CardContent className="space-y-3 p-4">
              <h2 className="text-sm font-semibold">{t('distribution.intelTerritoryTitle')}</h2>
              <table className="w-full text-sm">
                <thead className="text-muted-foreground"><tr className="border-b"><th className="p-2 text-start">{t('distribution.intelColEntity')}</th><th className="p-2 text-end">{t('distribution.intelColHealth')}</th><th className="p-2 text-end">{t('distribution.intelColCount')}</th></tr></thead>
                <tbody>{territories.map((tt) => (<tr key={tt.territoryId} className="border-b last:border-0"><td className="p-2 font-mono text-xs">{tt.territoryId}</td><td className="p-2 text-end font-medium">{tt.avgHealth}</td><td className="p-2 text-end">{tt.entities}</td></tr>))}</tbody>
              </table>
            </CardContent></Card>
          )}
        </div>
      )}
    </div>
  );
}
