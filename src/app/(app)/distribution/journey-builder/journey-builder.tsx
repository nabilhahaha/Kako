'use client';

import { useMemo, useState } from 'react';
import { Wand2, Download, CalendarDays } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { buildTisDataset, type TisCustomer, type TisSource } from '@/lib/tis/dataset';
import { datasetToCsv } from '@/lib/tis/export';
import { balanceRoutes, applyScenario, scenarioMetrics, customerWorkload, type Scenario } from '@/lib/planning';
import { countBy } from '@/lib/tis/scope';
import { PlanningCanvas, MetricsBar } from '../planning-board/planning-canvas';

/**
 * Weekly Single-Salesman Journey Builder — a Simple-Mode wizard:
 * Select salesman → Week → Working Days → Max Visits/Day → Generate → Review by Day
 * → Adjust → Export. Pure composition over the SHARED planning engines (FR workload,
 * day assignment, scenario board). Read-only + export; no live writes.
 */
export function JourneyBuilder({ customers, asOf, source, labels = {} }: { customers: TisCustomer[]; asOf: string; source: TisSource; labels?: Record<string, string> }) {
  const { t } = useI18n();
  const dataset = useMemo(() => buildTisDataset(customers, { asOf, source }), [customers, asOf, source]);
  const salesmen = useMemo(() => countBy(dataset.customers, (c) => c.ownership.salesmanId).filter((o) => o.key), [dataset]);

  const [salesman, setSalesman] = useState('');
  const [workingDays, setWorkingDays] = useState('5');
  const [maxPerDay, setMaxPerDay] = useState('25');
  const [scenario, setScenario] = useState<Scenario | null>(null);

  const salesmanLabel = (id: string) => labels[id] ?? id;
  const mine = useMemo(() => dataset.customers.filter((c) => c.ownership.salesmanId === salesman), [dataset, salesman]);
  const scopeIds = useMemo(() => new Set(mine.map((c) => c.id)), [mine]);

  // Feasibility: weekly visits vs days × max/day capacity.
  const totalVisits = useMemo(() => Math.round(mine.reduce((s, c) => s + (customerWorkload(c) ?? 0), 0)), [mine]);
  const capacity = (Number(workingDays) || 5) * (Number(maxPerDay) || 25);
  const overCapacity = salesman !== '' && totalVisits > capacity;

  function onGenerate() {
    if (!salesman) return;
    const plan = balanceRoutes(mine, { routeCount: 1, workingDays: Number(workingDays) || 5, maxVisitsPerDay: Number(maxPerDay) || 25 });
    setScenario({ id: 'journey', name: salesmanLabel(salesman), assignments: plan.assignments });
  }
  function onExport() {
    if (!scenario) return;
    const scoped = { ...dataset, customers: applyScenario(dataset, scenario).customers.filter((c) => scopeIds.has(c.id)) };
    const blob = new Blob([datasetToCsv(scoped)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `journey-${salesman}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  const metrics = useMemo(() => (scenario ? scenarioMetrics({ ...dataset, customers: applyScenario(dataset, scenario).customers.filter((c) => scopeIds.has(c.id)) }) : null), [dataset, scenario, scopeIds]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="space-y-1">
            <Label className="text-xs">{t('journeyBuilder.selectSalesman')}</Label>
            <select className="h-9 min-w-[200px] rounded-md border bg-background px-2 text-sm" value={salesman} onChange={(e) => { setSalesman(e.target.value); setScenario(null); }}>
              <option value="">{t('journeyBuilder.pickSalesman')}</option>
              {salesmen.map((o) => <option key={o.key} value={o.key}>{salesmanLabel(o.key)} ({o.count})</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('journeyBuilder.horizon')}</Label>
            <div className="flex gap-1">
              <span className="inline-flex items-center gap-1 rounded-md border bg-secondary px-2.5 py-1.5 text-xs font-medium"><CalendarDays className="h-3.5 w-3.5" /> {t('journeyBuilder.week')}</span>
              <span className="inline-flex items-center rounded-md border px-2.5 py-1.5 text-xs text-muted-foreground">{t('journeyBuilder.monthSoon')}</span>
            </div>
          </div>
          <div className="space-y-1"><Label className="text-xs">{t('routeOpt.workingDays')}</Label><Input type="number" min={1} max={7} dir="ltr" className="w-24" value={workingDays} onChange={(e) => setWorkingDays(e.target.value)} /></div>
          <div className="space-y-1"><Label className="text-xs">{t('routeOpt.maxVisitsPerDay')}</Label><Input type="number" min={1} dir="ltr" className="w-24" value={maxPerDay} onChange={(e) => setMaxPerDay(e.target.value)} /></div>
          <Button onClick={onGenerate} disabled={!salesman}><Wand2 className="h-4 w-4" /> {scenario ? t('journeyBuilder.regenerate') : t('routeOpt.generate')}</Button>
        </CardContent>
      </Card>

      {salesman && (
        <p className={`text-sm ${overCapacity ? 'text-destructive' : 'text-muted-foreground'}`}>
          {overCapacity
            ? t('journeyBuilder.capacityWarn').replace('{visits}', String(totalVisits)).replace('{cap}', String(capacity))
            : t('journeyBuilder.capacityOk').replace('{visits}', String(totalVisits)).replace('{cap}', String(capacity))}
        </p>
      )}

      {scenario && metrics && (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">{t('journeyBuilder.reviewHint')}</p>
            <Button size="sm" variant="outline" onClick={onExport}><Download className="h-4 w-4" /> {t('routeOpt.exportCsv')}</Button>
          </div>
          <MetricsBar m={metrics} />
          <PlanningCanvas dataset={dataset} scenario={scenario} onChange={setScenario} scopeIds={scopeIds} labels={labels} initialView="day" />
        </>
      )}
    </div>
  );
}
