'use client';

import { useMemo, useState } from 'react';
import { Wand2, Copy, Download, LayoutGrid, Map as MapIcon, CalendarDays } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { buildTisDataset, customerWorkload, isValidGeo, type TisCustomer, type TisSource } from '@/lib/tis/dataset';
import { applyScenario, type Scenario, type ScenarioMetrics } from '@/lib/tis/scenario';
import { currentPlanScenario, moveCustomer, reassignDay, cloneScenario, liveMetrics } from '@/lib/tis/plan-edit';
import { balanceRoutes } from '@/lib/tis/optimize-routes';
import { datasetToCsv } from '@/lib/tis/export';
import { PlanningMap, type PlanMapPoint } from './planning-map';

const COVER_HEX: Record<string, string> = { on_track: '#16a34a', under_covered: '#d97706', over_covered: '#2563eb', never_visited: '#dc2626' };
const PALETTE = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#ea580c', '#4f46e5', '#0d9488', '#9333ea'];
const UNASSIGNED = '__unassigned';
const DOW = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const UNSCHEDULED = '__none';

/**
 * VTP-2 Planning Board (Simple Mode). Route columns (kanban) of customer cards;
 * drag a card to another route → metrics recompute instantly. Scenario tabs
 * (Current · Optimized · A/B/C) + Clone; Export to the single-model CSV. Pure
 * client-side over the TIS-0 scenario engine — no server round-trip until export.
 */
export function PlanningBoard({ customers, asOf, source }: { customers: TisCustomer[]; asOf: string; source: TisSource }) {
  const { t } = useI18n();
  const dataset = useMemo(() => buildTisDataset(customers, { asOf, source }), [customers, asOf, source]);
  const defaultRouteCount = useMemo(() => Math.max(1, new Set(customers.map((c) => c.ownership.routeId).filter(Boolean)).size || 6), [customers]);

  const [scenarios, setScenarios] = useState<Scenario[]>(() => [currentPlanScenario(dataset)]);
  const [activeId, setActiveId] = useState('current');
  const [view, setView] = useState<'board' | 'map' | 'calendar'>('board');
  const [targetRoute, setTargetRoute] = useState('');
  const active = scenarios.find((s) => s.id === activeId) ?? scenarios[0];

  const update = (next: Scenario) => setScenarios((list) => list.map((s) => (s.id === next.id ? next : s)));

  function onOptimize() {
    const plan = balanceRoutes(dataset.customers, { routeCount: defaultRouteCount });
    const opt: Scenario = { id: 'optimized', name: t('planBoard.optimized'), assignments: plan.assignments };
    setScenarios((list) => [...list.filter((s) => s.id !== 'optimized'), opt]);
    setActiveId('optimized');
  }
  function onClone() {
    const letters = ['A', 'B', 'C'];
    const used = new Set(scenarios.map((s) => s.id));
    const id = letters.find((l) => !used.has(l));
    if (!id) return;
    const clone = cloneScenario(active, id, `${t('planBoard.scenario')} ${id}`);
    setScenarios((list) => [...list, clone]);
    setActiveId(id);
  }
  function onExport() {
    const csv = datasetToCsv(applyScenario(dataset, active));
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `plan-${active.id}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }
  function onDrop(routeId: string, e: React.DragEvent) {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    if (!id) return;
    update(moveCustomer(active, id, routeId === UNASSIGNED ? null : routeId));
  }

  // Group the applied scenario into route columns.
  const columns = useMemo(() => {
    const applied = applyScenario(dataset, active);
    const m = new Map<string, TisCustomer[]>();
    for (const c of applied.customers) {
      const k = c.ownership.routeId ?? UNASSIGNED;
      (m.get(k) ?? m.set(k, []).get(k)!).push(c);
    }
    return [...m.entries()].sort((a, b) => (a[0] === UNASSIGNED ? 1 : b[0] === UNASSIGNED ? -1 : a[0].localeCompare(b[0])));
  }, [dataset, active]);

  const metrics = useMemo(() => liveMetrics(dataset, active), [dataset, active]);

  // Stable route → colour map (for the map view).
  const routeColor = useMemo(() => {
    const m = new Map<string, string>();
    columns.forEach(([routeId], i) => { if (routeId !== UNASSIGNED) m.set(routeId, PALETTE[i % PALETTE.length]); });
    return m;
  }, [columns]);

  // Map points coloured by current scenario route.
  const mapPoints = useMemo<PlanMapPoint[]>(() => {
    const applied = applyScenario(dataset, active);
    return applied.customers.filter((c) => isValidGeo(c.geo)).map((c) => ({ id: c.id, name: c.name, lat: c.geo!.lat, lng: c.geo!.lng, color: c.ownership.routeId ? routeColor.get(c.ownership.routeId) ?? '#94a3b8' : '#cbd5e1' }));
  }, [dataset, active, routeColor]);

  // Calendar: customers grouped by their scenario visit-day.
  const dayColumns = useMemo(() => {
    const dayOf = new Map(active.assignments.map((a) => [a.customerId, a.dayOfWeek ?? null]));
    const m = new Map<string, TisCustomer[]>([...DOW, UNSCHEDULED].map((d) => [d, []]));
    for (const c of dataset.customers) { const d = dayOf.get(c.id) ?? UNSCHEDULED; (m.get(d) ?? m.get(UNSCHEDULED)!).push(c); }
    return m;
  }, [dataset, active]);

  function onAssignToTarget(id: string) {
    if (!targetRoute) return;
    update(moveCustomer(active, id, targetRoute === UNASSIGNED ? null : targetRoute));
  }
  function onDropDay(day: string, e: React.DragEvent) {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    if (id) update(reassignDay(active, id, day === UNSCHEDULED ? null : day));
  }

  return (
    <div className="space-y-4">
      {/* Toolbar: scenario tabs + actions. */}
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

      {/* Live metrics. */}
      <MetricsBar m={metrics} t={t} />

      {/* View switcher: Board · Map · Calendar. */}
      <div className="flex flex-wrap items-center gap-1 border-b">
        {([['board', LayoutGrid, t('planBoard.viewBoard')], ['map', MapIcon, t('planBoard.viewMap')], ['calendar', CalendarDays, t('planBoard.viewCalendar')]] as const).map(([key, Icon, label]) => (
          <button key={key} onClick={() => setView(key)} className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm ${view === key ? 'border-primary font-medium' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {/* MAP view: colour by route + select-then-assign to a target route. */}
      {view === 'map' && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">{t('planBoard.assignTo')}</span>
            <select className="h-9 rounded-md border bg-background px-2 text-sm" value={targetRoute} onChange={(e) => setTargetRoute(e.target.value)}>
              <option value="">{t('planBoard.pickRoute')}</option>
              {columns.filter(([r]) => r !== UNASSIGNED).map(([r], i) => (
                <option key={r} value={r}>{`${t('routeOpt.route')} ${i + 1}`}</option>
              ))}
              <option value={UNASSIGNED}>{t('planBoard.unassigned')}</option>
            </select>
            <span className="text-xs text-muted-foreground">{t('planBoard.mapHint')}</span>
          </div>
          <PlanningMap points={mapPoints} onSelect={onAssignToTarget} />
        </div>
      )}

      {/* CALENDAR view: drag customers between visit days. */}
      {view === 'calendar' && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {[...DOW, UNSCHEDULED].map((day) => {
            const list = dayColumns.get(day) ?? [];
            return (
              <div key={day} onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDropDay(day, e)} className="w-44 shrink-0 rounded-md border bg-muted/30">
                <div className="border-b bg-background/95 px-2 py-1.5 text-sm font-medium">{day === UNSCHEDULED ? t('planBoard.unscheduled') : t(`planBoard.day_${day}`)} <span className="text-[11px] text-muted-foreground">({list.length})</span></div>
                <div className="max-h-[55vh] space-y-1 overflow-y-auto p-1.5">
                  {list.slice(0, 80).map((c) => (
                    <div key={c.id} draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', c.id)} className="flex cursor-grab items-center gap-1.5 rounded border bg-background px-2 py-1 text-xs">
                      <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: COVER_HEX[c.coverage ?? ''] ?? '#cbd5e1' }} />
                      <span className="truncate">{c.name}</span>
                    </div>
                  ))}
                  {list.length > 80 && <p className="px-2 py-1 text-[11px] text-muted-foreground">+{list.length - 80} more</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* BOARD view: kanban route columns. */}
      {view === 'board' && (
      <div className="flex gap-3 overflow-x-auto pb-2">
        {columns.map(([routeId, list]) => {
          const workload = list.reduce((s, c) => s + (customerWorkload(c) ?? 0), 0);
          const value = list.reduce((s, c) => s + (c.salesValue ?? 0), 0);
          return (
            <div key={routeId} onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDrop(routeId, e)} className="w-56 shrink-0 rounded-md border bg-muted/30">
              <div className="sticky top-0 border-b bg-background/95 px-2 py-1.5">
                <p className="truncate text-sm font-medium">{routeId === UNASSIGNED ? t('planBoard.unassigned') : routeId}</p>
                <p className="text-[11px] text-muted-foreground" dir="ltr">{list.length} · {Math.round(workload)}v · {Math.round(value / 1000)}k</p>
              </div>
              <div className="max-h-[55vh] space-y-1 overflow-y-auto p-1.5">
                {list.slice(0, 120).map((c) => (
                  <div key={c.id} draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', c.id)}
                    className="flex cursor-grab items-center gap-1.5 rounded border bg-background px-2 py-1 text-xs active:cursor-grabbing">
                    <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: COVER_HEX[c.coverage ?? ''] ?? '#cbd5e1' }} />
                    <span className="truncate">{c.name}</span>
                    <span className="ms-auto shrink-0 text-[10px] uppercase text-muted-foreground">{c.grade ?? ''}</span>
                  </div>
                ))}
                {list.length > 120 && <p className="px-2 py-1 text-[11px] text-muted-foreground">+{list.length - 120} more</p>}
              </div>
            </div>
          );
        })}
      </div>
      )}
      <p className="text-xs text-muted-foreground">{t('planBoard.hint')}</p>
    </div>
  );
}

function MetricsBar({ m, t }: { m: ScenarioMetrics; t: (k: string) => string }) {
  const cells: { label: string; value: string }[] = [
    { label: t('routeOpt.customers'), value: String(m.customers) },
    { label: t('routeOpt.visits'), value: String(m.visits) },
    { label: t('routeOpt.distance'), value: `${(m.distanceM / 1000).toFixed(1)} km` },
    { label: t('routeOpt.balance'), value: `${m.routeBalancePct}%` },
    { label: t('planBoard.valueBalance'), value: `${m.valueBalancePct}%` },
    { label: t('coverage.headlineCoverage'), value: `${m.coveragePct}%` },
  ];
  return (
    <Card>
      <CardContent className="flex flex-wrap gap-x-6 gap-y-2 p-3">
        {cells.map((c) => (
          <div key={c.label} className="min-w-[80px]">
            <p className="text-[11px] text-muted-foreground">{c.label}</p>
            <p className="text-lg font-bold tabular-nums" dir="ltr">{c.value}</p>
          </div>
        ))}
        <Badge variant="secondary" className="self-center">{t('routeOpt.routes')}: {m.routeCount}</Badge>
      </CardContent>
    </Card>
  );
}
