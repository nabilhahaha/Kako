import { redirect } from 'next/navigation';
import { Trophy } from 'lucide-react';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { getT } from '@/lib/i18n/server';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { loadRetailExecData } from '@/lib/erp/retail-exec-data';
import { summarizeOutletMetrics } from '@/lib/erp/retail-rollup';
import { perfectStorePillars, DEFAULT_PILLAR_WEIGHTS } from '@/lib/erp/perfect-store';
import { EmptyCard } from '../_retail/ui';

export default async function PerfectStoreDashboard() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!hasPermission(ctx, 'reports.view')) redirect('/dashboard');
  const { t, locale } = await getT();
  const supabase = await createClient();
  const data = await loadRetailExecData(supabase, { locale });

  const summary = summarizeOutletMetrics(data.metrics);
  const surveyScores = data.metrics.map((m) => m.surveyScorePct).filter((v): v is number => v != null);
  const avgSurvey = surveyScores.length ? Math.round(surveyScores.reduce((a, b) => a + b, 0) / surveyScores.length) : null;

  // Map the 5 Perfect Store pillars to the data we have (deterministic; pillars
  // with no source drop out and the rest renormalise — documented, not faked).
  const pillarPct: Record<string, number | null> = {
    availability: summary.outlets > 0 ? summary.compliancePct : null, // presence (numeric)
    assortment: summary.outlets > 0 ? summary.weightedPct : null,     // weighted MSL breadth
    visibility: avgSurvey,                                            // in-store survey
    pricing: null,                                                    // price-compliance (future pillar)
    execution: avgSurvey,                                             // execution via survey
  };
  const pillars = (['availability', 'assortment', 'visibility', 'pricing', 'execution'] as const).map((k) => ({
    key: k, label: t(`retail.dash.pillars.${k}`), pct: pillarPct[k], weight: DEFAULT_PILLAR_WEIGHTS[k],
  }));
  const result = perfectStorePillars(pillars);
  const psTone = result.band === 'gold' ? 'success' : result.band === 'silver' ? 'info' : result.band === 'bronze' ? 'warning' : 'destructive';

  return (
    <div className="space-y-6">
      <PageHeader title={t('retail.dash.psTitle')} description={t('retail.dash.psSub')} />
      {!data.ready ? <EmptyCard text={t('retail.dash.noData')} /> : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <StatCard label={t('retail.assort.perfectStore')} value={`${result.score}%`} icon={Trophy} tone={psTone} hint={t(`retail.assort.psband.${result.band}`)} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {pillars.map((p) => {
              const has = p.pct != null;
              return (
                <Card key={p.key}>
                  <CardContent className="space-y-2 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{p.label}</span>
                      <Badge variant="secondary">{Math.round(p.weight * 100)}%</Badge>
                    </div>
                    <div className="text-2xl font-bold tabular-nums" dir="ltr">{has ? `${Math.round(p.pct as number)}%` : '—'}</div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${has ? Math.round(p.pct as number) : 0}%` }} />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
