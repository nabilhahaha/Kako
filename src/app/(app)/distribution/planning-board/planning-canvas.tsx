'use client';

import { useMemo, useState } from 'react';
import { LayoutGrid, Map as MapIcon, CalendarDays } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { applyScenario, type Scenario, type ScenarioMetrics } from '@/lib/tis/scenario';
import { moveCustomer, reassignDay } from '@/lib/tis/plan-edit';
import { customerWorkload, isValidGeo, type TisCustomer, type TisDataset } from '@/lib/tis/dataset';
import { PlanningMap, type PlanMapPoint } from './planning-map';

export const COVER_HEX: Record<string, string> = { on_track: '#16a34a', under_covered: '#d97706', over_covered: '#2563eb', never_visited: '#dc2626' };
export const PALETTE = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#ea580c', '#4f46e5', '#0d9488', '#9333ea'];
const UNASSIGNED = '__unassigned';
const DOW = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const UNSCHEDULED = '__none';

/** Stable route → colour map for the active scenario's route columns. */
export function routeColorMap(dataset: TisDataset, scenario: Scenario): Map<string, string> {
  const ids = [...new Set(applyScenario(dataset, scenario).customers.map((c) => c.ownership.routeId).filter((r): r is string => !!r))].sort();
  const m = new Map<string, string>();
  ids.forEach((id, i) => m.set(id, PALETTE[i % PALETTE.length]));
  return m;
}

/** Scenario-route–coloured map points for a dataset+scenario. */
export function scenarioMapPoints(dataset: TisDataset, scenario: Scenario, color: Map<string, string>): PlanMapPoint[] {
  return applyScenario(dataset, scenario).customers.filter((c) => isValidGeo(c.geo)).map((c) => ({
    id: c.id, name: c.name, lat: c.geo!.lat, lng: c.geo!.lng,
    color: c.ownership.routeId ? color.get(c.ownership.routeId) ?? '#94a3b8' : '#cbd5e1',
  }));
}

/**
 * Controlled planning canvas (VTP) — Board · Map · Calendar views over a single
 * scenario; every edit calls `onChange`. Shared by the standalone Planning Board
 * and the Territory Intelligence Studio (one scenario state). Pure client-side.
 */
export function PlanningCanvas({ dataset, scenario, onChange }: { dataset: TisDataset; scenario: Scenario; onChange: (next: Scenario) => void }) {
  const { t } = useI18n();
  const [view, setView] = useState<'board' | 'map' | 'calendar'>('board');
  const [targetRoute, setTargetRoute] = useState('');

  const columns = useMemo(() => {
    const m = new Map<string, TisCustomer[]>();
    for (const c of applyScenario(dataset, scenario).customers) {
      const k = c.ownership.routeId ?? UNASSIGNED;
      (m.get(k) ?? m.set(k, []).get(k)!).push(c);
    }
    return [...m.entries()].sort((a, b) => (a[0] === UNASSIGNED ? 1 : b[0] === UNASSIGNED ? -1 : a[0].localeCompare(b[0])));
  }, [dataset, scenario]);

  const color = useMemo(() => routeColorMap(dataset, scenario), [dataset, scenario]);
  const mapPoints = useMemo(() => scenarioMapPoints(dataset, scenario, color), [dataset, scenario, color]);
  const dayColumns = useMemo(() => {
    const dayOf = new Map(scenario.assignments.map((a) => [a.customerId, a.dayOfWeek ?? null]));
    const m = new Map<string, TisCustomer[]>([...DOW, UNSCHEDULED].map((d) => [d, []]));
    for (const c of dataset.customers) { const d = dayOf.get(c.id) ?? UNSCHEDULED; (m.get(d) ?? m.get(UNSCHEDULED)!).push(c); }
    return m;
  }, [dataset, scenario]);

  const dropRoute = (routeId: string, e: React.DragEvent) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); if (id) onChange(moveCustomer(scenario, id, routeId === UNASSIGNED ? null : routeId)); };
  const dropDay = (day: string, e: React.DragEvent) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); if (id) onChange(reassignDay(scenario, id, day === UNSCHEDULED ? null : day)); };
  const assignTarget = (id: string) => { if (targetRoute) onChange(moveCustomer(scenario, id, targetRoute === UNASSIGNED ? null : targetRoute)); };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1 border-b">
        {([['board', LayoutGrid, t('planBoard.viewBoard')], ['map', MapIcon, t('planBoard.viewMap')], ['calendar', CalendarDays, t('planBoard.viewCalendar')]] as const).map(([key, Icon, label]) => (
          <button key={key} onClick={() => setView(key)} className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm ${view === key ? 'border-primary font-medium' : 'border-transparent text-muted-foreground hover:text-foreground'}`}><Icon className="h-4 w-4" /> {label}</button>
        ))}
      </div>

      {view === 'map' && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">{t('planBoard.assignTo')}</span>
            <select className="h-9 rounded-md border bg-background px-2 text-sm" value={targetRoute} onChange={(e) => setTargetRoute(e.target.value)}>
              <option value="">{t('planBoard.pickRoute')}</option>
              {columns.filter(([r]) => r !== UNASSIGNED).map(([r], i) => <option key={r} value={r}>{`${t('routeOpt.route')} ${i + 1}`}</option>)}
              <option value={UNASSIGNED}>{t('planBoard.unassigned')}</option>
            </select>
            <span className="text-xs text-muted-foreground">{t('planBoard.mapHint')}</span>
          </div>
          <PlanningMap points={mapPoints} onSelect={assignTarget} />
        </div>
      )}

      {view === 'calendar' && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {[...DOW, UNSCHEDULED].map((day) => {
            const list = dayColumns.get(day) ?? [];
            return (
              <div key={day} onDragOver={(e) => e.preventDefault()} onDrop={(e) => dropDay(day, e)} className="w-44 shrink-0 rounded-md border bg-muted/30">
                <div className="border-b bg-background/95 px-2 py-1.5 text-sm font-medium">{day === UNSCHEDULED ? t('planBoard.unscheduled') : t(`planBoard.day_${day}`)} <span className="text-[11px] text-muted-foreground">({list.length})</span></div>
                <div className="max-h-[55vh] space-y-1 overflow-y-auto p-1.5">
                  {list.slice(0, 80).map((c) => <DragCard key={c.id} c={c} />)}
                  {list.length > 80 && <p className="px-2 py-1 text-[11px] text-muted-foreground">+{list.length - 80} more</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view === 'board' && (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {columns.map(([routeId, list], i) => {
            const workload = list.reduce((s, c) => s + (customerWorkload(c) ?? 0), 0);
            const value = list.reduce((s, c) => s + (c.salesValue ?? 0), 0);
            return (
              <div key={routeId} onDragOver={(e) => e.preventDefault()} onDrop={(e) => dropRoute(routeId, e)} className="w-56 shrink-0 rounded-md border bg-muted/30">
                <div className="sticky top-0 border-b bg-background/95 px-2 py-1.5">
                  <p className="truncate text-sm font-medium">{routeId === UNASSIGNED ? t('planBoard.unassigned') : `${t('routeOpt.route')} ${i + 1}`}</p>
                  <p className="text-[11px] text-muted-foreground" dir="ltr">{list.length} · {Math.round(workload)}v · {Math.round(value / 1000)}k</p>
                </div>
                <div className="max-h-[55vh] space-y-1 overflow-y-auto p-1.5">
                  {list.slice(0, 120).map((c) => <DragCard key={c.id} c={c} grade />)}
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

function DragCard({ c, grade }: { c: TisCustomer; grade?: boolean }) {
  return (
    <div draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', c.id)} className="flex cursor-grab items-center gap-1.5 rounded border bg-background px-2 py-1 text-xs active:cursor-grabbing">
      <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: COVER_HEX[c.coverage ?? ''] ?? '#cbd5e1' }} />
      <span className="truncate">{c.name}</span>
      {grade && <span className="ms-auto shrink-0 text-[10px] uppercase text-muted-foreground">{c.grade ?? ''}</span>}
    </div>
  );
}

/** Shared live-metrics strip. */
export function MetricsBar({ m }: { m: ScenarioMetrics }) {
  const { t } = useI18n();
  const cells: [string, string][] = [
    [t('routeOpt.customers'), String(m.customers)],
    [t('routeOpt.visits'), String(m.visits)],
    [t('routeOpt.distance'), `${(m.distanceM / 1000).toFixed(1)} km`],
    [t('routeOpt.balance'), `${m.routeBalancePct}%`],
    [t('planBoard.valueBalance'), `${m.valueBalancePct}%`],
    [t('coverage.headlineCoverage'), `${m.coveragePct}%`],
  ];
  return (
    <Card>
      <CardContent className="flex flex-wrap gap-x-6 gap-y-2 p-3">
        {cells.map(([label, value]) => (
          <div key={label} className="min-w-[80px]"><p className="text-[11px] text-muted-foreground">{label}</p><p className="text-lg font-bold tabular-nums" dir="ltr">{value}</p></div>
        ))}
        <Badge variant="secondary" className="self-center">{t('routeOpt.routes')}: {m.routeCount}</Badge>
      </CardContent>
    </Card>
  );
}
