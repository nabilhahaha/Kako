import { redirect } from 'next/navigation';
import { PackageCheck, AlertTriangle, CheckCircle2, Layers } from 'lucide-react';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { getT } from '@/lib/i18n/server';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard, type StatTone } from '@/components/shared/stat-card';
import { Badge } from '@/components/ui/badge';
import { loadRetailExecData } from '@/lib/erp/retail-exec-data';
import { rollupByDimension, summarizeOutletMetrics, skuCompliance, brandCompliance } from '@/lib/erp/retail-rollup';
import { complianceBand } from '@/lib/erp/assortment';
import { DimensionTabs, RollupTable, EmptyCard, dimLabel } from '../_retail/ui';

const TONE: Record<'good' | 'attention' | 'critical', StatTone> = { good: 'success', attention: 'warning', critical: 'destructive' };

export default async function MslComplianceDashboard({ searchParams }: { searchParams?: Promise<{ dim?: string }> }) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!hasPermission(ctx, 'reports.view')) redirect('/dashboard');
  const { t, locale } = await getT();
  const sp = (await searchParams) ?? {};
  const supabase = await createClient();
  const data = await loadRetailExecData(supabase, { locale });

  const dims = [
    ...data.outletDimensions.map((k) => ({ key: k, label: dimLabel(k, t) })),
    ...(data.productUniverse.length ? [{ key: 'brand', label: dimLabel('brand', t) }, { key: 'sku', label: dimLabel('sku', t) }] : []),
  ];
  const dim = sp.dim && dims.some((d) => d.key === sp.dim) ? sp.dim : (dims[0]?.key ?? 'region');
  const summary = summarizeOutletMetrics(data.metrics);
  const cols = { dimension: dimLabel(dim, t), outlets: t('retail.dash.col.outlets'), compliance: t('retail.dash.col.compliance'), weighted: t('retail.dash.col.weighted'), gap: t('retail.dash.col.gap') };

  return (
    <div className="space-y-6">
      <PageHeader title={t('retail.dash.mslTitle')} description={t('retail.dash.mslSub')} />
      {!data.ready ? <EmptyCard text={t('retail.dash.noData')} /> : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label={t('retail.assort.compliance')} value={`${summary.compliancePct}%`} icon={PackageCheck} tone={TONE[complianceBand(summary.compliancePct)]} hint={`${t('retail.assort.weighted')} ${summary.weightedPct}%`} />
            <StatCard label={t('retail.dash.col.outlets')} value={String(summary.outlets)} icon={Layers} tone="info" />
            <StatCard label={t('retail.assort.gapLines')} value={String(summary.gapLines)} icon={AlertTriangle} tone={summary.gapLines > 0 ? 'warning' : 'success'} />
            <StatCard label={t('retail.assort.fullyCompliant')} value={String(summary.fullyCompliant)} icon={CheckCircle2} tone="success" />
          </div>

          <div className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">{t('retail.dash.drillBy')}</span>
            <DimensionTabs basePath="/distribution/msl-compliance" dims={dims} current={dim} />
          </div>

          {dim === 'sku' ? (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-muted-foreground"><tr>
                  <th className="px-3 py-2 text-start font-medium">{t('retail.dash.dims.sku')}</th>
                  <th className="px-3 py-2 text-end font-medium">{t('retail.dash.col.required')}</th>
                  <th className="px-3 py-2 text-end font-medium">{t('retail.dash.col.present')}</th>
                  <th className="px-3 py-2 text-end font-medium">{t('retail.dash.col.compliance')}</th>
                </tr></thead>
                <tbody>
                  {skuCompliance(data.metrics, 50).map((s) => (
                    <tr key={s.productId} className="border-t">
                      <td className="px-3 py-2">{data.productLabel.get(s.productId) ?? s.productId.slice(0, 6)}</td>
                      <td className="px-3 py-2 text-end tabular-nums">{s.requiredOutlets}</td>
                      <td className="px-3 py-2 text-end tabular-nums">{s.presentOutlets}</td>
                      <td className="px-3 py-2 text-end"><Badge variant={complianceBand(s.compliancePct) === 'good' ? 'success' : complianceBand(s.compliancePct) === 'attention' ? 'warning' : 'destructive'}>{s.compliancePct}%</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <RollupTable rows={dim === 'brand' ? brandCompliance(data.metrics, data.brandOf) : rollupByDimension(data.metrics, dim)} cols={cols} />
          )}
        </>
      )}
    </div>
  );
}
