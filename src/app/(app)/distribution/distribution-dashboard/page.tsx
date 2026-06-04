import { redirect } from 'next/navigation';
import { Layers, Activity, Boxes, AlertTriangle } from 'lucide-react';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { getT } from '@/lib/i18n/server';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { loadRetailExecData } from '@/lib/erp/retail-exec-data';
import { summarizeOutletMetrics } from '@/lib/erp/retail-rollup';
import { distributionForProducts, summarizeDistribution, distributionByDimension, type OutletForKpi, type DimensionRow } from '@/lib/erp/distribution-kpi';
import { DimensionTabs, EmptyCard, dimLabel } from '../_retail/ui';

export default async function DistributionDashboard({ searchParams }: { searchParams?: Promise<{ dim?: string }> }) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!hasPermission(ctx, 'reports.view')) redirect('/dashboard');
  const { t, locale } = await getT();
  const sp = (await searchParams) ?? {};
  const supabase = await createClient();
  const data = await loadRetailExecData(supabase, { locale });

  const dims = data.outletDimensions.map((k) => ({ key: k, label: dimLabel(k, t) }));
  const dim = sp.dim && dims.some((d) => d.key === sp.dim) ? sp.dim : (dims[0]?.key ?? 'region');

  // Build the KPI outlet universe from the shared metrics.
  const kpiOutlets: OutletForKpi[] = data.metrics.map((m) => ({
    customerId: m.customerId, weight: m.value || 1, soldProductIds: data.soldByCustomer.get(m.customerId) ?? new Set<string>(),
  }));
  const overall = summarizeDistribution(distributionForProducts(data.productUniverse, kpiOutlets));
  const summary = summarizeOutletMetrics(data.metrics);
  const skuReach = distributionForProducts(data.productUniverse, kpiOutlets).filter((p) => p.outletsSelling > 0).length;

  // Group the outlet universe by the chosen dimension for the rollup.
  const groups = new Map<string, { label: string; outlets: OutletForKpi[] }>();
  for (const m of data.metrics) {
    const dv = m.dims[dim]; if (!dv) continue;
    const key = dv.id ?? '__none__';
    const o = kpiOutlets.find((k) => k.customerId === m.customerId)!;
    (groups.get(key) ?? groups.set(key, { label: dv.label, outlets: [] }).get(key)!).outlets.push(o);
  }
  const dimRows: DimensionRow[] = [...groups.entries()].map(([key, g]) => ({ key, label: g.label, outlets: g.outlets }));
  const byDim = distributionByDimension(data.productUniverse, dimRows).sort((a, b) => a.numericPct - b.numericPct);

  return (
    <div className="space-y-6">
      <PageHeader title={t('retail.dash.distTitle')} description={t('retail.dash.distSub')} />
      {!data.ready ? <EmptyCard text={t('retail.dash.noData')} /> : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label={t('retail.assort.numericDist')} value={`${overall.avgNumericPct}%`} icon={Layers} tone="info" hint={`${t('retail.assort.weightedDist')} ${overall.avgWeightedPct}%`} />
            <StatCard label={t('retail.dash.activeCustomers')} value={String(summary.activeCustomers)} icon={Activity} tone="primary" />
            <StatCard label={t('retail.dash.skuReach')} value={`${skuReach}/${data.productUniverse.length}`} icon={Boxes} tone="info" />
            <StatCard label={t('retail.dash.distributionGap')} value={String(summary.gapLines)} icon={AlertTriangle} tone={summary.gapLines > 0 ? 'warning' : 'success'} />
          </div>

          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{t('retail.dash.drillBy')}</span>
            <DimensionTabs basePath="/distribution/distribution-dashboard" dims={dims} current={dim} />
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 text-muted-foreground"><tr>
                <th className="px-3 py-2 text-start font-medium">{dimLabel(dim, t)}</th>
                <th className="px-3 py-2 text-end font-medium">{t('retail.dash.col.outlets')}</th>
                <th className="px-3 py-2 text-end font-medium">{t('retail.assort.numericDist')}</th>
                <th className="px-3 py-2 text-end font-medium">{t('retail.assort.weightedDist')}</th>
              </tr></thead>
              <tbody>
                {byDim.map((r) => (
                  <tr key={r.key} className="border-t">
                    <td className="px-3 py-2">{r.label}</td>
                    <td className="px-3 py-2 text-end tabular-nums">{r.outlets}</td>
                    <td className="px-3 py-2 text-end tabular-nums">{r.numericPct}%</td>
                    <td className="px-3 py-2 text-end tabular-nums">{r.weightedPct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
