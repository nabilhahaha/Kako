import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { BackLink } from '@/components/shared/back-link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft } from 'lucide-react';
import { getT } from '@/lib/i18n/server';
import { PerfViewFilter } from './perf-filter';
import { TrendChart, TREND_COLORS } from '@/components/field/trend-chart';

interface Metrics { planned: number; visited: number; missed: number; coverage_pct: number; compliance_pct: number; merch_compliance: number | null; survey_score: number | null; oos_score: number | null; oos_count: number; opportunity_score: number | null; opportunity_count: number; opportunity_value: number; merch_count: number; overall: number | null; captures: number }
interface Perf { level: string; id: string | null; name: string | null; metrics: Metrics; coverage_trend: Record<string, unknown>[]; score_trend: Record<string, unknown>[] }
interface Child { id: string; name: string; overall: number | null; coverage_pct: number; captures: number }
const ALL_LEVELS = ['region', 'area', 'branch', 'route', 'rep', 'customer'];

/** Generic, configurable drill node (FE-5d-3): coverage / compliance / execution
 *  + component breakdown + trends, and a list of children at the company's next
 *  configured hierarchy level. Works for company/region/area/branch/route/rep/customer. */
export default async function PerfPage({ params, searchParams }: { params: Promise<{ level: string; id: string }>; searchParams: Promise<{ view?: string }> }) {
  const { level, id } = await params;
  const { view: viewParam } = await searchParams;
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.company?.id || !ctx.modules.includes('field_ops')) {
    return <div><PageHeader title={t('field.perf.title')} /><Card><CardContent className="p-8 text-center text-muted-foreground">{t('field.perf.noAccess')}</CardContent></Card></div>;
  }

  const view = viewParam === 'daily' || viewParam === 'monthly' ? viewParam : 'weekly';
  const bucket = view === 'daily' ? 'day' : view === 'monthly' ? 'month' : 'week';
  const spanDays = view === 'daily' ? 14 : view === 'monthly' ? 365 : 84;
  const today = new Date();
  const from = new Date(today); from.setDate(from.getDate() - (spanDays - 1));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const nodeId = level === 'company' ? null : id;

  const supabase = await createClient();
  const { data: perfData } = await supabase.rpc('erp_fe_perf', { p_level: level, p_id: nodeId, p_from: iso(from), p_to: iso(today), p_bucket: bucket });
  if (!perfData) {
    return <div><PageHeader title={t('field.perf.title')} /><Card><CardContent className="p-8 text-center text-muted-foreground">{t('field.perf.noAccess')}</CardContent></Card></div>;
  }
  const perf = perfData as Perf;
  const m = perf.metrics;

  // configurable hierarchy → next child level
  const { data: setRow } = await supabase.from('erp_fe_settings').select('hierarchy').eq('company_id', ctx.company.id).maybeSingle();
  const hierarchy: string[] = ((setRow as { hierarchy?: string[] } | null)?.hierarchy ?? ['branch', 'route', 'rep', 'customer']).filter((l) => ALL_LEVELS.includes(l));
  let childLevel: string | null = null;
  if (level === 'company') childLevel = hierarchy[0] ?? null;
  else { const i = hierarchy.indexOf(level); childLevel = i >= 0 && i < hierarchy.length - 1 ? hierarchy[i + 1] : null; }

  let children: Child[] = [];
  if (childLevel) {
    const { data: ch } = await supabase.rpc('erp_fe_perf_children', { p_level: level, p_id: nodeId, p_child_level: childLevel, p_from: iso(from), p_to: iso(today) });
    children = (ch as Child[] | null) ?? [];
  }

  const title = level === 'company' ? t('field.perf.levels.company') : (perf.name || id);
  const Stat = ({ label, value }: { label: string; value: string | number }) => (
    <Card><CardContent className="p-3"><p className="text-lg font-semibold">{value}</p><p className="text-[11px] text-muted-foreground">{label}</p></CardContent></Card>
  );

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <BackLink href="/field/dashboard" label={t('field.perf.back')} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PageHeader title={title} description={t(`field.perf.levels.${level}`)} />
        <PerfViewFilter view={view} />
      </div>

      {/* metrics */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label={t('field.score.overall')} value={m.overall ?? '—'} />
        <Stat label={t('field.dashboard.coveragePct')} value={`${m.coverage_pct}%`} />
        <Stat label={t('field.dashboard.compliancePct')} value={`${m.compliance_pct}%`} />
        <Stat label={t('field.dashboard.merch')} value={m.merch_compliance != null ? `${m.merch_compliance}%` : '—'} />
        <Stat label={t('field.dashboard.survey')} value={m.survey_score ?? '—'} />
        <Stat label={t('field.dashboard.oos')} value={`${m.oos_score ?? '—'}${m.oos_count > 0 ? ` (${m.oos_count})` : ''}`} />
        <Stat label={t('field.dashboard.opp')} value={`${m.opportunity_score ?? '—'}${m.opportunity_count > 0 ? ` (${m.opportunity_count})` : ''}`} />
        <Stat label={t('field.capture.kinds.merchandising')} value={m.merch_count} />
      </div>

      {/* trends */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardContent className="p-3">
          <p className="mb-1 text-xs font-medium text-muted-foreground">{t('field.dashboard.coverageTrend')}</p>
          <TrendChart data={perf.coverage_trend} series={[
            { key: 'coverage_pct', label: t('field.dashboard.coveragePct'), color: TREND_COLORS.coverage },
            { key: 'compliance_pct', label: t('field.dashboard.compliancePct'), color: TREND_COLORS.compliance },
          ]} />
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="mb-1 text-xs font-medium text-muted-foreground">{t('field.dashboard.captureTrend')}</p>
          <TrendChart data={perf.score_trend} series={[
            { key: 'merch_count', label: t('field.dashboard.merch'), color: TREND_COLORS.merch },
            { key: 'competitor_count', label: t('field.capture.kinds.competitor'), color: TREND_COLORS.competitor },
            { key: 'oos_count', label: t('field.dashboard.oos'), color: TREND_COLORS.oos },
            { key: 'opportunity_count', label: t('field.dashboard.opp'), color: TREND_COLORS.opportunity },
          ]} />
        </CardContent></Card>
      </div>

      {/* children (next configured level) */}
      {childLevel && (
        <div>
          <h3 className="mb-2 font-semibold">{t('field.perf.breakdown')} · {t(`field.perf.levels.${childLevel}`)}</h3>
          {children.length === 0 ? <Card><CardContent className="p-4 text-center text-sm text-muted-foreground">{t('field.perf.noData')}</CardContent></Card>
            : <div className="space-y-2">{children.map((ch) => (
                <Link key={ch.id} href={`/field/perf/${childLevel}/${encodeURIComponent(ch.id)}?view=${view}`}>
                  <Card className="transition-colors hover:border-primary"><CardContent className="flex items-center justify-between gap-3 p-3 text-sm">
                    <span className="min-w-0 truncate font-medium">{ch.name}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <Badge variant="secondary">{ch.overall ?? '—'}</Badge>
                      <Badge variant="outline">{ch.coverage_pct}%</Badge>
                      <ChevronLeft className="h-4 w-4 text-muted-foreground rtl:rotate-180" />
                    </span>
                  </CardContent></Card>
                </Link>
              ))}</div>}
        </div>
      )}
    </div>
  );
}
