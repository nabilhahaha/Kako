import { redirect } from 'next/navigation';
import { AlertTriangle, PackageX, TrendingDown, ListX } from 'lucide-react';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { getT } from '@/lib/i18n/server';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { loadRetailExecData } from '@/lib/erp/retail-exec-data';
import { summarizeOutletMetrics, topMissingSkus, rollupByDimension } from '@/lib/erp/retail-rollup';
import { RollupTable, EmptyCard, dimLabel, DimensionTabs } from '../_retail/ui';

export default async function OosDashboard({ searchParams }: { searchParams?: Promise<{ dim?: string }> }) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!hasPermission(ctx, 'reports.view')) redirect('/dashboard');
  const { t, locale } = await getT();
  const sp = (await searchParams) ?? {};
  const supabase = await createClient();
  const data = await loadRetailExecData(supabase, { locale });

  const dims = data.outletDimensions.map((k) => ({ key: k, label: dimLabel(k, t) }));
  const dim = sp.dim && dims.some((d) => d.key === sp.dim) ? sp.dim : (dims[0]?.key ?? 'region');
  const summary = summarizeOutletMetrics(data.metrics);
  const topMissing = topMissingSkus(data.metrics, 15);
  // Lost distribution opportunities = mandatory lines not present, value-weighted
  // by the outlets where the gap occurs (a proxy for incremental revenue at risk).
  const lostValue = data.metrics.reduce((sum, m) => sum + (m.required > 0 ? (m.gap / m.required) * m.value : 0), 0);
  const cols = { dimension: dimLabel(dim, t), outlets: t('retail.dash.col.outlets'), compliance: t('retail.dash.col.compliance'), weighted: t('retail.dash.col.weighted'), gap: t('retail.dash.missingMandatory') };

  return (
    <div className="space-y-6">
      <PageHeader title={t('retail.dash.oosTitle')} description={t('retail.dash.oosSub')} />
      {!data.ready ? <EmptyCard text={t('retail.dash.noData')} /> : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label={t('retail.dash.oosPct')} value={`${summary.oosPct}%`} icon={PackageX} tone={summary.oosPct > 20 ? 'destructive' : summary.oosPct > 10 ? 'warning' : 'success'} />
            <StatCard label={t('retail.dash.missingMandatory')} value={String(summary.gapLines)} icon={AlertTriangle} tone={summary.gapLines > 0 ? 'warning' : 'success'} />
            <StatCard label={t('retail.dash.lostOpportunities')} value={Math.round(lostValue).toLocaleString()} icon={TrendingDown} tone="destructive" />
            <StatCard label={t('retail.dash.topMissing')} value={String(topMissing.length)} icon={ListX} tone="info" />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="space-y-3">
              <h2 className="text-sm font-semibold">{t('retail.dash.topMissing')}</h2>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/50 text-muted-foreground"><tr>
                    <th className="px-3 py-2 text-start font-medium">{t('retail.dash.dims.sku')}</th>
                    <th className="px-3 py-2 text-end font-medium">{t('retail.dash.col.count')}</th>
                  </tr></thead>
                  <tbody>
                    {topMissing.map((m) => (
                      <tr key={m.productId} className="border-t">
                        <td className="px-3 py-2">{data.productLabel.get(m.productId) ?? m.productId.slice(0, 6)}</td>
                        <td className="px-3 py-2 text-end tabular-nums text-destructive">{m.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">{t('retail.dash.drillBy')}: {dimLabel(dim, t)}</h2>
              </div>
              <DimensionTabs basePath="/distribution/oos" dims={dims} current={dim} />
              <RollupTable rows={rollupByDimension(data.metrics, dim)} cols={cols} />
            </section>
          </div>
        </>
      )}
    </div>
  );
}
