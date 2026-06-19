'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Loader2, Wand2, Download } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { generateRoutePlan, type RouteOptimizationResult } from './actions';
import type { RouteConstraints } from '@/lib/tis/optimize-routes';
import type { ScenarioMetrics } from '@/lib/tis/scenario';

/**
 * RO-2 Route Optimization Studio (Simple Mode). Default: set working days →
 * Generate → see the balanced plan + Current-vs-Optimized comparison + per-route
 * table. Advanced (opt-in): route count, max/route, capacity. Pure presentation
 * over the server action; the result is a TIS-0 scenario (export/apply later).
 */
const METRIC_ROWS: { key: keyof ScenarioMetrics; labelKey: string; better: 'low' | 'high' }[] = [
  { key: 'routeCount', labelKey: 'routeOpt.routes', better: 'low' },
  { key: 'visits', labelKey: 'routeOpt.visits', better: 'low' },
  { key: 'distanceM', labelKey: 'routeOpt.distance', better: 'low' },
  { key: 'routeBalancePct', labelKey: 'routeOpt.balance', better: 'high' },
  { key: 'coveragePct', labelKey: 'coverage.headlineCoverage', better: 'high' },
  { key: 'salesValue', labelKey: 'routeOpt.salesValue', better: 'high' },
];

export function RouteOptimizer() {
  const { t } = useI18n();
  const [workingDays, setWorkingDays] = useState('5');
  const [advanced, setAdvanced] = useState(false);
  const [routeCount, setRouteCount] = useState('');
  const [maxPerRoute, setMaxPerRoute] = useState('');
  const [maxVisitsPerDay, setMaxVisitsPerDay] = useState('');
  const [result, setResult] = useState<RouteOptimizationResult | null>(null);
  const [pending, start] = useTransition();

  const num = (s: string) => { const n = Number(s); return Number.isFinite(n) && n > 0 ? n : undefined; };

  function onGenerate() {
    const constraints: RouteConstraints = {
      workingDays: num(workingDays),
      ...(advanced ? { routeCount: num(routeCount), maxPerRoute: num(maxPerRoute), maxVisitsPerDay: num(maxVisitsPerDay) } : {}),
    };
    start(async () => {
      const res = await generateRoutePlan(constraints);
      if (!res.ok) { toast.error(t(`routeOpt.err_${res.error}`) || t('routeOpt.errGeneric')); return; }
      setResult(res.data);
    });
  }

  function onExport() {
    if (!result) return;
    const blob = new Blob([result.csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `route-plan-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  const fmt = (key: keyof ScenarioMetrics, v: number) =>
    key === 'distanceM' ? `${(v / 1000).toFixed(1)} km` : key === 'routeBalancePct' || key === 'coveragePct' ? `${v}%` : key === 'salesValue' ? v.toLocaleString() : String(v);

  return (
    <div className="space-y-5">
      {/* Simple controls: working days + Generate. Advanced is opt-in. */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="space-y-1">
            <Label className="text-xs">{t('routeOpt.workingDays')}</Label>
            <Input type="number" min={1} max={7} dir="ltr" className="w-24" value={workingDays} onChange={(e) => setWorkingDays(e.target.value)} />
          </div>
          {advanced && (
            <>
              <div className="space-y-1"><Label className="text-xs">{t('routeOpt.routeCount')}</Label><Input type="number" min={1} dir="ltr" className="w-28" placeholder={t('routeOpt.auto')} value={routeCount} onChange={(e) => setRouteCount(e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">{t('routeOpt.maxPerRoute')}</Label><Input type="number" min={1} dir="ltr" className="w-28" value={maxPerRoute} onChange={(e) => setMaxPerRoute(e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">{t('routeOpt.maxVisitsPerDay')}</Label><Input type="number" min={1} dir="ltr" className="w-28" value={maxVisitsPerDay} onChange={(e) => setMaxVisitsPerDay(e.target.value)} /></div>
            </>
          )}
          <Button onClick={onGenerate} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} {t('routeOpt.generate')}
          </Button>
          <button type="button" className="ms-auto text-xs text-muted-foreground underline" onClick={() => setAdvanced((v) => !v)}>
            {advanced ? t('routeOpt.hideAdvanced') : t('routeOpt.advanced')}
          </button>
        </CardContent>
      </Card>

      {result && (
        <>
          {/* Plain-language headline + export. */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">
              {t('routeOpt.summary').replace('{routes}', String(result.plan.routeCount)).replace('{balance}', String(result.plan.workloadBalancePct))}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={onExport}>
              <Download className="h-4 w-4" /> {t('routeOpt.exportCsv')}
            </Button>
          </div>

          {/* Current vs Optimized — identical metrics. */}
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="border-b text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-start font-medium">{t('routeOpt.metric')}</th>
                    <th className="px-3 py-2 text-end font-medium">{result.compare[0].name === 'Current Plan' ? t('routeOpt.current') : result.compare[0].name}</th>
                    <th className="px-3 py-2 text-end font-medium">{t('routeOpt.optimized')}</th>
                  </tr>
                </thead>
                <tbody>
                  {METRIC_ROWS.map(({ key, labelKey, better }) => {
                    const cur = result.compare[0].metrics[key];
                    const opt = result.compare[1].metrics[key];
                    const improved = better === 'low' ? opt < cur : opt > cur;
                    return (
                      <tr key={key} className="border-b last:border-0">
                        <td className="px-3 py-2">{t(labelKey)}</td>
                        <td className="px-3 py-2 text-end tabular-nums text-muted-foreground" dir="ltr">{fmt(key, cur)}</td>
                        <td className="px-3 py-2 text-end tabular-nums" dir="ltr">
                          <span className={improved && opt !== cur ? 'font-semibold text-success' : ''}>{fmt(key, opt)}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Per-route balance. */}
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="border-b text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-start font-medium">{t('routeOpt.route')}</th>
                    <th className="px-3 py-2 text-end font-medium">{t('routeOpt.customers')}</th>
                    <th className="px-3 py-2 text-end font-medium">{t('routeOpt.workload')}</th>
                    <th className="px-3 py-2 text-end font-medium">{t('routeOpt.salesValue')}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.plan.routes.map((r, i) => (
                    <tr key={r.routeId} className="border-b last:border-0">
                      <td className="px-3 py-2"><Badge variant="secondary">{t('routeOpt.routeN').replace('{n}', String(i + 1))}</Badge></td>
                      <td className="px-3 py-2 text-end tabular-nums" dir="ltr">{r.customers}</td>
                      <td className="px-3 py-2 text-end tabular-nums" dir="ltr">{r.workload}</td>
                      <td className="px-3 py-2 text-end tabular-nums" dir="ltr">{r.salesValue.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground">{t('routeOpt.previewNote')}</p>
        </>
      )}
    </div>
  );
}
