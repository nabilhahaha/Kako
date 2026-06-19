'use client';

import { useMemo, useState } from 'react';
import { Wand2, Copy, Download } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { Button } from '@/components/ui/button';
import { buildTisDataset, type TisCustomer, type TisSource } from '@/lib/tis/dataset';
import { applyScenario, scenarioMetrics, type Scenario } from '@/lib/tis/scenario';
import { currentPlanScenario, cloneScenario, setAssignment } from '@/lib/tis/plan-edit';
import { balanceRoutes } from '@/lib/tis/optimize-routes';
import { datasetToCsv } from '@/lib/tis/export';
import { initialScope, scopeCustomerIds, type ScopeState } from '@/lib/tis/scope';
import { PlanningCanvas, MetricsBar } from './planning-canvas';
import { ScopeBar } from './scope-bar';

/**
 * Standalone Planning Board (VTP) — scenario tabs + toolbar (Optimize · Clone ·
 * Export) + a shared ScopeBar (Region → Salesman → Route) + live metrics over a
 * controlled PlanningCanvas. Scope, metrics, board, and optimize all act on the
 * same working set. Pure client-side over the TIS-0 scenario engine.
 */
export function PlanningBoard({ customers, asOf, source }: { customers: TisCustomer[]; asOf: string; source: TisSource }) {
  const { t } = useI18n();
  const dataset = useMemo(() => buildTisDataset(customers, { asOf, source }), [customers, asOf, source]);
  const defaultRouteCount = useMemo(() => Math.max(1, new Set(customers.map((c) => c.ownership.routeId).filter(Boolean)).size || 6), [customers]);

  const [scenarios, setScenarios] = useState<Scenario[]>(() => [currentPlanScenario(dataset)]);
  const [activeId, setActiveId] = useState('current');
  const [scope, setScope] = useState<ScopeState>(() => initialScope(dataset.customers));
  const active = scenarios.find((s) => s.id === activeId) ?? scenarios[0];
  const update = (next: Scenario) => setScenarios((list) => list.map((s) => (s.id === next.id ? next : s)));

  const applied = useMemo(() => applyScenario(dataset, active), [dataset, active]);
  const scopeIds = useMemo(() => scopeCustomerIds(applied.customers, scope), [applied, scope]);
  const working = useMemo(() => applied.customers.filter((c) => scopeIds.has(c.id)), [applied, scopeIds]);
  const metrics = useMemo(() => scenarioMetrics({ ...dataset, customers: working }), [dataset, working]);

  function onOptimize() {
    const plan = balanceRoutes(working, { routeCount: Math.min(defaultRouteCount, new Set(working.map((c) => c.ownership.routeId).filter(Boolean)).size || defaultRouteCount) });
    const base = active.id === 'current' ? active : (scenarios.find((s) => s.id === 'current') ?? active);
    const merged = plan.assignments.reduce((sc, a) => setAssignment(sc, a), { ...base, id: 'optimized', name: t('planBoard.optimized') });
    setScenarios((list) => [...list.filter((s) => s.id !== 'optimized'), merged]);
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
      <ScopeBar customers={applied.customers} scope={scope} onChange={setScope} />
      <MetricsBar m={metrics} />
      <PlanningCanvas dataset={dataset} scenario={active} onChange={update} scopeIds={scopeIds} />
    </div>
  );
}
