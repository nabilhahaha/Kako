import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PackageCheck, Layers, PackageX, Trophy, Activity, ArrowRight, type LucideIcon } from 'lucide-react';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { getT } from '@/lib/i18n/server';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard, type StatTone } from '@/components/shared/stat-card';
import { Card, CardContent } from '@/components/ui/card';
import { loadRetailExecData } from '@/lib/erp/retail-exec-data';
import { summarizeOutletMetrics } from '@/lib/erp/retail-rollup';
import { distributionForProducts, summarizeDistribution, type OutletForKpi } from '@/lib/erp/distribution-kpi';
import { perfectStorePillars, DEFAULT_PILLAR_WEIGHTS } from '@/lib/erp/perfect-store';
import { complianceBand } from '@/lib/erp/assortment';
import { EmptyCard } from '../_retail/ui';

const TONE: Record<'good' | 'attention' | 'critical', StatTone> = { good: 'success', attention: 'warning', critical: 'destructive' };

export default async function RetailCockpit() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!hasPermission(ctx, 'reports.view')) redirect('/dashboard');
  const { t, locale } = await getT();
  const supabase = await createClient();
  const data = await loadRetailExecData(supabase, { locale });

  const summary = summarizeOutletMetrics(data.metrics);
  const kpiOutlets: OutletForKpi[] = data.metrics.map((m) => ({ customerId: m.customerId, weight: m.value || 1, soldProductIds: data.soldByCustomer.get(m.customerId) ?? new Set<string>() }));
  const dist = summarizeDistribution(distributionForProducts(data.productUniverse, kpiOutlets));
  const surveyScores = data.metrics.map((m) => m.surveyScorePct).filter((v): v is number => v != null);
  const avgSurvey = surveyScores.length ? Math.round(surveyScores.reduce((a, b) => a + b, 0) / surveyScores.length) : null;
  const ps = perfectStorePillars([
    { key: 'availability', pct: summary.outlets > 0 ? summary.compliancePct : null, weight: DEFAULT_PILLAR_WEIGHTS.availability },
    { key: 'assortment', pct: summary.outlets > 0 ? summary.weightedPct : null, weight: DEFAULT_PILLAR_WEIGHTS.assortment },
    { key: 'visibility', pct: avgSurvey, weight: DEFAULT_PILLAR_WEIGHTS.visibility },
  ]);
  // Route-productivity proxy from existing sales data: avg SKUs sold per active outlet.
  const avgLines = summary.activeCustomers > 0
    ? Math.round(data.metrics.reduce((s, m) => s + m.soldCount, 0) / summary.activeCustomers)
    : 0;

  const links: { icon: LucideIcon; key: string; href: string }[] = [
    { icon: PackageCheck, key: 'mslTitle', href: '/distribution/msl-compliance' },
    { icon: Layers, key: 'distTitle', href: '/distribution/distribution-dashboard' },
    { icon: PackageX, key: 'oosTitle', href: '/distribution/oos' },
    { icon: Trophy, key: 'psTitle', href: '/distribution/perfect-store' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t('retail.dash.cockpit')} description={t('retail.dash.cockpitSub')} />
      {!data.ready ? <EmptyCard text={t('retail.dash.noData')} /> : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <StatCard label={t('retail.assort.compliance')} value={`${summary.compliancePct}%`} icon={PackageCheck} tone={TONE[complianceBand(summary.compliancePct)]} href="/distribution/msl-compliance" />
            <StatCard label={t('retail.assort.numericDist')} value={`${dist.avgNumericPct}%`} icon={Layers} tone="info" href="/distribution/distribution-dashboard" hint={`${t('retail.assort.weightedDist')} ${dist.avgWeightedPct}%`} />
            <StatCard label={t('retail.dash.oosPct')} value={`${summary.oosPct}%`} icon={PackageX} tone={summary.oosPct > 20 ? 'destructive' : summary.oosPct > 10 ? 'warning' : 'success'} href="/distribution/oos" />
            <StatCard label={t('retail.assort.perfectStore')} value={ps.hasData ? `${ps.score}%` : '—'} icon={Trophy} tone={ps.band === 'gold' ? 'success' : ps.band === 'silver' ? 'info' : ps.band === 'bronze' ? 'warning' : 'destructive'} href="/distribution/perfect-store" />
            <StatCard label={t('retail.dash.routeProductivity')} value={String(avgLines)} icon={Activity} tone="primary" hint={`${summary.activeCustomers} ${t('retail.dash.activeCustomers')}`} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {links.map((l) => (
              <Link key={l.key} href={l.href} className="group rounded-xl">
                <Card className="h-full transition-colors hover:border-primary/40">
                  <CardContent className="flex h-full items-center gap-3 p-4">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><l.icon className="h-5 w-5" /></span>
                    <span className="flex items-center gap-1 text-sm font-medium">{t(`retail.dash.${l.key}`)}<ArrowRight className="h-4 w-4 text-muted-foreground rtl:rotate-180" /></span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
