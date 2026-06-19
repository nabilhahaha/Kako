'use client';

import { useMemo, useState } from 'react';
import { LayoutGrid, Map as MapIcon, CalendarDays, Users, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { applyScenario, type Scenario, type ScenarioMetrics } from '@/lib/tis/scenario';
import { moveCustomer, reassignDay, reassignSalesman } from '@/lib/tis/plan-edit';
import { customerWorkload, isValidGeo, type TisCustomer, type TisDataset } from '@/lib/tis/dataset';
import { PlanningMap, type PlanMapPoint } from './planning-map';

export const COVER_HEX: Record<string, string> = { on_track: '#16a34a', under_covered: '#d97706', over_covered: '#2563eb', never_visited: '#dc2626' };
export const PALETTE = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d', '#ea580c', '#4f46e5', '#0d9488', '#9333ea'];
const UNASSIGNED = '__unassigned';
const DOW = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const UNSCHEDULED = '__none';
/** Above this route count, the canvas auto-scopes to a region instead of loading
 *  all routes — Region → Salesman → Route progressive drill-down (VTP-S1). */
const SCOPE_THRESHOLD = 12;

type View = 'route' | 'day' | 'salesman' | 'map';

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

/** Count distinct values of a key across customers, sorted desc by count. '' (null)
 *  keys are kept so an "Unassigned" bucket is selectable. */
function countBy(customers: readonly TisCustomer[], keyOf: (c: TisCustomer) => string | null | undefined): { key: string; count: number }[] {
  const m = new Map<string, number>();
  for (const c of customers) { const k = keyOf(c) ?? ''; m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
}

/** Column stats — the real balancing signals at scale. */
function colStats(list: readonly TisCustomer[]) {
  return {
    count: list.length,
    workload: list.reduce((s, c) => s + (customerWorkload(c) ?? 0), 0),
    value: list.reduce((s, c) => s + (c.salesValue ?? 0), 0),
  };
}

/** Smart default scope: at scale, focus the largest *meaningful* region (≥2 routes)
 *  so a manager never loads every route at once; small/degenerate tenants stay 'all'. */
function initialScopeRegion(dataset: TisDataset, defaultRegionId?: string): string {
  const customers = dataset.customers;
  const allRoutes = new Set(customers.map((c) => c.ownership.routeId).filter(Boolean)).size;
  if (allRoutes <= SCOPE_THRESHOLD) return '';
  if (defaultRegionId && customers.some((c) => c.ownership.regionId === defaultRegionId)) return defaultRegionId;
  // Region with the most routes; only auto-scope if it meaningfully narrows the board.
  const routesByRegion = new Map<string, Set<string>>();
  for (const c of customers) {
    if (!c.ownership.regionId || !c.ownership.routeId) continue;
    (routesByRegion.get(c.ownership.regionId) ?? routesByRegion.set(c.ownership.regionId, new Set()).get(c.ownership.regionId)!).add(c.ownership.routeId);
  }
  let best = '', bestN = 0;
  for (const [region, routes] of routesByRegion) if (routes.size > bestN) { bestN = routes.size; best = region; }
  return bestN >= 2 ? best : '';
}

/**
 * Controlled planning canvas (VTP) — a scoped working set (Region → Salesman →
 * Route) viewed through Route · Day · Salesman · Map lenses; every edit calls
 * `onChange`. Region scoping keeps the board usable for large FMCG orgs (dozens of
 * routes) without ever loading them all at once. Shared by the standalone Planning
 * Board and the Territory Intelligence Studio. Pure client-side.
 */
export function PlanningCanvas({ dataset, scenario, onChange, labels = {}, defaultRegionId }: {
  dataset: TisDataset; scenario: Scenario; onChange: (next: Scenario) => void;
  labels?: Record<string, string>; defaultRegionId?: string;
}) {
  const { t } = useI18n();
  const [view, setView] = useState<View>('route');
  const [targetRoute, setTargetRoute] = useState('');
  const [scopeRegion, setScopeRegion] = useState<string>(() => initialScopeRegion(dataset, defaultRegionId));
  const [scopeSalesman, setScopeSalesman] = useState('');
  const [scopeRoutes, setScopeRoutes] = useState<Set<string>>(new Set());

  const applied = useMemo(() => applyScenario(dataset, scenario), [dataset, scenario]);
  const color = useMemo(() => routeColorMap(dataset, scenario), [dataset, scenario]);

  // ── Labels ──────────────────────────────────────────────────────────────────
  const regionLabel = (id: string) => (id ? labels[id] ?? id : t('planBoard.unassigned'));
  const salesmanLabel = (id: string) => (id ? labels[id] ?? id : t('planBoard.unassignedSalesman'));
  const routeIndex = useMemo(() => {
    const ids = [...new Set(applied.customers.map((c) => c.ownership.routeId).filter((r): r is string => !!r))].sort();
    return new Map(ids.map((id, i) => [id, i]));
  }, [applied]);
  const routeLabel = (id: string) => (id ? labels[id] ?? `${t('routeOpt.route')} ${(routeIndex.get(id) ?? 0) + 1}` : t('planBoard.unassigned'));

  // ── Progressive scope: Region → Salesman → Route ──────────────────────────────
  const allRouteCount = useMemo(() => new Set(applied.customers.map((c) => c.ownership.routeId).filter(Boolean)).size, [applied]);
  const regionOptions = useMemo(() => countBy(applied.customers, (c) => c.ownership.regionId), [applied]);
  const afterRegion = useMemo(() => applied.customers.filter((c) => !scopeRegion || c.ownership.regionId === scopeRegion), [applied, scopeRegion]);
  const salesmanOptions = useMemo(() => countBy(afterRegion, (c) => c.ownership.salesmanId), [afterRegion]);
  const afterSalesman = useMemo(() => afterRegion.filter((c) => !scopeSalesman || (c.ownership.salesmanId ?? '') === scopeSalesman), [afterRegion, scopeSalesman]);
  const routeOptions = useMemo(() => countBy(afterSalesman, (c) => c.ownership.routeId), [afterSalesman]);
  const working = useMemo(() => afterSalesman.filter((c) => scopeRoutes.size === 0 || (c.ownership.routeId != null && scopeRoutes.has(c.ownership.routeId))), [afterSalesman, scopeRoutes]);

  const pickRegion = (v: string) => { setScopeRegion(v); setScopeSalesman(''); setScopeRoutes(new Set()); };
  const pickSalesman = (v: string) => { setScopeSalesman(v); setScopeRoutes(new Set()); };
  const toggleRoute = (id: string) => setScopeRoutes((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const clearScope = () => { setScopeRegion(''); setScopeSalesman(''); setScopeRoutes(new Set()); };
  const scoped = scopeRegion !== '' || scopeSalesman !== '' || scopeRoutes.size > 0;
  const shownRoutes = scopeRoutes.size > 0 ? scopeRoutes.size : routeOptions.filter((r) => r.key).length;

  // ── Columns over the working set ──────────────────────────────────────────────
  const routeColumns = useMemo(() => groupCols(working, (c) => c.ownership.routeId ?? UNASSIGNED), [working]);
  const salesmanColumns = useMemo(() => groupCols(working, (c) => c.ownership.salesmanId ?? UNASSIGNED), [working]);
  const dayColumns = useMemo(() => {
    const dayOf = new Map(scenario.assignments.map((a) => [a.customerId, a.dayOfWeek ?? null]));
    const m = new Map<string, TisCustomer[]>([...DOW, UNSCHEDULED].map((d) => [d, []]));
    for (const c of working) { const d = dayOf.get(c.id) ?? UNSCHEDULED; (m.get(d) ?? m.get(UNSCHEDULED)!).push(c); }
    return m;
  }, [working, scenario]);
  const mapPoints = useMemo<PlanMapPoint[]>(() => working.filter((c) => isValidGeo(c.geo)).map((c) => ({
    id: c.id, name: c.name, lat: c.geo!.lat, lng: c.geo!.lng,
    color: c.ownership.routeId ? color.get(c.ownership.routeId) ?? '#94a3b8' : '#cbd5e1',
  })), [working, color]);

  const dropRoute = (routeId: string, e: React.DragEvent) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); if (id) onChange(moveCustomer(scenario, id, routeId === UNASSIGNED ? null : routeId)); };
  const dropSalesman = (salesmanId: string, e: React.DragEvent) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); if (id) onChange(reassignSalesman(scenario, id, salesmanId === UNASSIGNED ? null : salesmanId)); };
  const dropDay = (day: string, e: React.DragEvent) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); if (id) onChange(reassignDay(scenario, id, day === UNSCHEDULED ? null : day)); };
  const assignTarget = (id: string) => { if (targetRoute) onChange(moveCustomer(scenario, id, targetRoute === UNASSIGNED ? null : targetRoute)); };

  return (
    <div className="space-y-3">
      {/* ── Scope bar (VTP-S1): Region → Salesman → Route working set ── */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-2 text-sm">
        <ScopeSelect label={t('planBoard.scopeRegion')} value={scopeRegion} onChange={pickRegion} allLabel={t('planBoard.allRegions')} options={regionOptions} labelOf={regionLabel} />
        <ScopeSelect label={t('planBoard.scopeSalesman')} value={scopeSalesman} onChange={pickSalesman} allLabel={t('planBoard.allSalesmen')} options={salesmanOptions} labelOf={salesmanLabel} />
        {/* Route multi-select chips (within the region/salesman drill-down). */}
        {routeOptions.filter((r) => r.key).length > 1 && (
          <div className="flex max-w-full items-center gap-1 overflow-x-auto">
            <span className="shrink-0 text-xs text-muted-foreground">{t('planBoard.scopeRoutes')}:</span>
            {routeOptions.filter((r) => r.key).slice(0, 40).map((r) => (
              <button key={r.key} onClick={() => toggleRoute(r.key)} className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${scopeRoutes.has(r.key) ? 'border-primary bg-primary/10 font-medium' : 'hover:bg-muted'}`}>{routeLabel(r.key)}</button>
            ))}
          </div>
        )}
        <span className="ms-auto shrink-0 text-xs text-muted-foreground" dir="ltr">
          {t('planBoard.showingScope').replace('{r}', String(shownRoutes)).replace('{total}', String(allRouteCount)).replace('{n}', String(working.length))}
        </span>
        {scoped && <button onClick={clearScope} className="inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted"><X className="h-3 w-3" /> {t('planBoard.clearScope')}</button>}
      </div>

      {/* ── View switch: Route · Day · Salesman · Map ── */}
      <div className="flex flex-wrap items-center gap-1 border-b">
        {([['route', LayoutGrid, t('planBoard.viewRoute')], ['day', CalendarDays, t('planBoard.viewCalendar')], ['salesman', Users, t('planBoard.viewSalesman')], ['map', MapIcon, t('planBoard.viewMap')]] as const).map(([key, Icon, label]) => (
          <button key={key} onClick={() => setView(key)} className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm ${view === key ? 'border-primary font-medium' : 'border-transparent text-muted-foreground hover:text-foreground'}`}><Icon className="h-4 w-4" /> {label}</button>
        ))}
      </div>

      {view === 'map' && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">{t('planBoard.assignTo')}</span>
            <select className="h-9 rounded-md border bg-background px-2 text-sm" value={targetRoute} onChange={(e) => setTargetRoute(e.target.value)}>
              <option value="">{t('planBoard.pickRoute')}</option>
              {routeColumns.filter(([r]) => r !== UNASSIGNED).map(([r]) => <option key={r} value={r}>{routeLabel(r)}</option>)}
              <option value={UNASSIGNED}>{t('planBoard.unassigned')}</option>
            </select>
            <span className="text-xs text-muted-foreground">{t('planBoard.mapHint')}</span>
          </div>
          <PlanningMap points={mapPoints} onSelect={assignTarget} />
        </div>
      )}

      {view === 'day' && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {[...DOW, UNSCHEDULED].map((day) => {
            const list = dayColumns.get(day) ?? [];
            const s = colStats(list);
            return (
              <div key={day} onDragOver={(e) => e.preventDefault()} onDrop={(e) => dropDay(day, e)} className="w-44 shrink-0 rounded-md border bg-muted/30">
                <div className="border-b bg-background/95 px-2 py-1.5">
                  <p className="text-sm font-medium">{day === UNSCHEDULED ? t('planBoard.unscheduled') : t(`planBoard.day_${day}`)}</p>
                  <p className="text-[11px] text-muted-foreground" dir="ltr">{s.count} · {Math.round(s.workload)}v · {Math.round(s.value / 1000)}k</p>
                </div>
                <div className="max-h-[55vh] space-y-1 overflow-y-auto p-1.5">
                  {list.slice(0, 120).map((c) => <DragCard key={c.id} c={c} routeTag={routeLabel(c.ownership.routeId ?? '')} dotColor={c.ownership.routeId ? color.get(c.ownership.routeId) : undefined} />)}
                  {list.length > 120 && <p className="px-2 py-1 text-[11px] text-muted-foreground">+{list.length - 120} {t('planBoard.more')}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view === 'route' && (
        <BoardColumns columns={routeColumns} headerOf={(id) => routeLabel(id === UNASSIGNED ? '' : id)} unassignedKey={UNASSIGNED} unassignedLabel={t('planBoard.unassigned')} onDrop={dropRoute} grade more={t('planBoard.more')} />
      )}

      {view === 'salesman' && (
        <BoardColumns columns={salesmanColumns} headerOf={(id) => salesmanLabel(id === UNASSIGNED ? '' : id)} unassignedKey={UNASSIGNED} unassignedLabel={t('planBoard.unassignedSalesman')} onDrop={dropSalesman} more={t('planBoard.more')} />
      )}

      <p className="text-xs text-muted-foreground">{view === 'salesman' ? t('planBoard.hintSalesman') : t('planBoard.hint')}</p>
    </div>
  );
}

/** Group the working customers into sorted board columns (Unassigned last). */
function groupCols(customers: readonly TisCustomer[], keyOf: (c: TisCustomer) => string): [string, TisCustomer[]][] {
  const m = new Map<string, TisCustomer[]>();
  for (const c of customers) { const k = keyOf(c); (m.get(k) ?? m.set(k, []).get(k)!).push(c); }
  return [...m.entries()].sort((a, b) => (a[0] === UNASSIGNED ? 1 : b[0] === UNASSIGNED ? -1 : a[0].localeCompare(b[0])));
}

/** A drag-and-drop board (route or salesman columns) with count/workload/value headers. */
function BoardColumns({ columns, headerOf, unassignedKey, unassignedLabel, onDrop, grade, more }: {
  columns: [string, TisCustomer[]][]; headerOf: (key: string) => string; unassignedKey: string; unassignedLabel: string;
  onDrop: (key: string, e: React.DragEvent) => void; grade?: boolean; more: string;
}) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {columns.map(([key, list]) => {
        const s = colStats(list);
        return (
          <div key={key} onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDrop(key, e)} className="w-56 shrink-0 rounded-md border bg-muted/30">
            <div className="sticky top-0 border-b bg-background/95 px-2 py-1.5">
              <p className="truncate text-sm font-medium">{key === unassignedKey ? unassignedLabel : headerOf(key)}</p>
              <p className="text-[11px] text-muted-foreground" dir="ltr">{s.count} · {Math.round(s.workload)}v · {Math.round(s.value / 1000)}k</p>
            </div>
            <div className="max-h-[55vh] space-y-1 overflow-y-auto p-1.5">
              {list.slice(0, 120).map((c) => <DragCard key={c.id} c={c} grade={grade} />)}
              {list.length > 120 && <p className="px-2 py-1 text-[11px] text-muted-foreground">+{list.length - 120} {more}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DragCard({ c, grade, routeTag, dotColor }: { c: TisCustomer; grade?: boolean; routeTag?: string; dotColor?: string }) {
  return (
    <div draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', c.id)} className="flex cursor-grab items-center gap-1.5 rounded border bg-background px-2 py-1 text-xs active:cursor-grabbing">
      <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dotColor ?? COVER_HEX[c.coverage ?? ''] ?? '#cbd5e1' }} />
      <span className="truncate">{c.name}</span>
      {routeTag && <span className="ms-auto shrink-0 truncate text-[10px] text-muted-foreground">{routeTag}</span>}
      {grade && <span className="ms-auto shrink-0 text-[10px] uppercase text-muted-foreground">{c.grade ?? ''}</span>}
    </div>
  );
}

function ScopeSelect({ label, value, onChange, allLabel, options, labelOf }: {
  label: string; value: string; onChange: (v: string) => void; allLabel: string;
  options: { key: string; count: number }[]; labelOf: (id: string) => string;
}) {
  return (
    <label className="inline-flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <select className="h-8 max-w-[180px] rounded-md border bg-background px-2 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{allLabel}</option>
        {options.map((o) => <option key={o.key || '__none'} value={o.key}>{labelOf(o.key)} ({o.count})</option>)}
      </select>
    </label>
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
