'use client';

import { useMemo, useState } from 'react';
import { Wand2, Copy, Download } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { Button } from '@/components/ui/button';
import { buildTisDataset, type TisCustomer, type TisSource } from '@/lib/tis/dataset';
import { applyScenario, type Scenario } from '@/lib/tis/scenario';
import { currentPlanScenario, cloneScenario, liveMetrics } from '@/lib/tis/plan-edit';
import { balanceRoutes } from '@/lib/tis/optimize-routes';
import { datasetToCsv } from '@/lib/tis/export';
import { PlanningCanvas, MetricsBar } from './planning-canvas';

/**
 * Standalone Planning Board (VTP) — scenario tabs + toolbar (Optimize · Clone ·
 * Export) + live metrics over a controlled PlanningCanvas (Board · Map · Calendar).
 * Pure client-side over the TIS-0 scenario engine. The same canvas + scenario
 * state are reused by the Territory Intelligence Studio.
 */
export function PlanningBoard({ customers, asOf, source }: { customers: TisCustomer[]; asOf: string; source: TisSource }) {
  const { t } = useI18n();
  const dataset = useMemo(() => buildTisDataset(customers, { asOf, source }), [customers, asOf, source]);
  const defaultRouteCount = useMemo(() => Math.max(1, new Set(customers.map((c) => c.ownership.routeId).filter(Boolean)).size || 6), [customers]);

  const [scenarios, setScenarios] = useState<Scenario[]>(() => [currentPlanScenario(dataset)]);
  const [activeId, setActiveId] = useState('current');
  const active = scenarios.find((s) => s.id === activeId) ?? scenarios[0];
  const update = (next: Scenario) => setScenarios((list) => list.map((s) => (s.id === next.id ? next : s)));

  function onOptimize() {
    const plan = balanceRoutes(dataset.customers, { routeCount: defaultRouteCount });
    setScenarios((list) => [...list.filter((s) => s.id !== 'optimized'), { id: 'optimized', name: t('planBoard.optimized'), assignments: plan.assignments }]);
    setActiveId('optimized');
  }
  function onClone() {
    const id = ['A', 'B', 'C'].find((l) => !scenarios.some((s) => s.id === l));
    if (!id) return;
    setScenarios((list) => [...list, cloneScenario(active, id, `${t('planBoard.scenario')} ${id}`)]);
    setActiveId(id);
  }
  function onExport() {
    const blob = new Blob([datasetToCsv(applyScenario(dataset, active))], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `plan-${active.id}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  const metrics = useMemo(() => liveMetrics(dataset, active), [dataset, active]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {scenarios.map((s) => (
          <button key={s.id} onClick={() => setActiveId(s.id)} className={`rounded-md border px-3 py-1.5 text-sm ${s.id === activeId ? 'bg-secondary font-medium' : 'hover:bg-muted'}`}>{s.name}</button>
        ))}
        <div className="ms-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={onOptimize}><Wand2 className="h-4 w-4" /> {t('planBoard.optimize')}</Button>
          <Button size="sm" variant="outline" onClick={onClone}><Copy className="h-4 w-4" /> {t('planBoard.clone')}</Button>
          <Button size="sm" variant="outline" onClick={onExport}><Download className="h-4 w-4" /> {t('routeOpt.exportCsv')}</Button>
        </div>
      </div>
      <MetricsBar m={metrics} />
      <PlanningCanvas dataset={dataset} scenario={active} onChange={update} />
    </div>
  );
}
