'use client';

import { useMemo, useState } from 'react';
import { X, Wand2, Check, FileDown, CalendarDays, MapPin, AlertTriangle, Hand, Square, PenTool, Eye, Save, Send } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { buildXlsxWorkbook } from '@/lib/erp/xlsx-write';
import { saveJourneyPlan, submitPlanForApproval } from './rp-plan-actions';
import { serializeAssignments, serializeFrequencies, type StoredAssignment } from '@/lib/erp/route-planner-daily-plan';
import { SelectionMap, type SelMapPoint } from './selection-map';
import {
  generateJourneyPlan, computeDayLoads, journeyExportRows, journeyRouteKpis, validateJourneyPlan,
  dayColorOf, JOURNEY_FREQUENCIES, JOURNEY_WORKING_DAYS, visitsPerCycle,
  type JourneyFrequency, type JourneyCustomer, type JourneyPlan, type JourneyDay,
  type JourneyExportCustomer, type JourneyRoutedCustomer, type JourneyWarning, type JourneyAssignment,
} from '@/lib/tis/journey';

export interface JourneyInputCustomer {
  id: string; lat: number; lng: number; code: string | null; name: string;
  routeId: string; routeLabel: string; sales?: number;
}

function downloadXlsx(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Journey Planning workspace — a visual, map-first journey planner. The manager sets each
 * customer's visit frequency (no A/B/C auto-classification), the engine distributes them
 * geographically and balances workload across days, and the map colours every customer by
 * visit day so it is obvious whether the plan is correct. Two modes: plan all routes, or
 * focus and edit one route. Renders as a full-screen overlay over the planner.
 */
export function JourneyPanel({ customers, hasSales, onClose }: { customers: JourneyInputCustomer[]; hasSales: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const [freq, setFreq] = useState<Map<string, JourneyFrequency>>(() => new Map(customers.map((c) => [c.id, 'w1' as JourneyFrequency])));
  const [defaultFreq, setDefaultFreq] = useState<JourneyFrequency>('w1');
  const [plan, setPlan] = useState<JourneyPlan | null>(null);
  const [approved, setApproved] = useState(false);
  const [mode, setMode] = useState<'all' | 'one'>('all');
  const [focusRoute, setFocusRoute] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [dayFilter, setDayFilter] = useState<JourneyDay | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [moveDay, setMoveDay] = useState<JourneyDay>('sat');
  const [selectMode, setSelectMode] = useState<'pan' | 'box' | 'draw'>('pan');
  const [jpName, setJpName] = useState('');     // Wave C: save the journey plan to the server
  const [jpSaving, setJpSaving] = useState(false);
  const [jpSaved, setJpSaved] = useState(false);
  const [jpSavedId, setJpSavedId] = useState<string | null>(null);   // Wave K: submit for approval
  const [jpMsg, setJpMsg] = useState<string | null>(null);

  const byId = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);
  const freqLabel = (f: JourneyFrequency) => t(`routePlanner.jpFreq_${f}` as Parameters<typeof t>[0]);
  const dayLabel = (d: JourneyDay) => t(`routePlanner.jpDay_${d}` as Parameters<typeof t>[0]);

  const routes = useMemo(() => {
    const m = new Map<string, { label: string; list: JourneyInputCustomer[] }>();
    for (const c of customers) {
      if (!m.has(c.routeId)) m.set(c.routeId, { label: c.routeLabel, list: [] });
      m.get(c.routeId)!.list.push(c);
    }
    return [...m.entries()].sort((a, b) => a[1].label.localeCompare(b[1].label));
  }, [customers]);

  const routed = (): JourneyRoutedCustomer[] => customers.map((c) => ({ id: c.id, lat: c.lat, lng: c.lng, frequency: freq.get(c.id) ?? 'w1', sales: c.sales, routeId: c.routeId }));

  function applyAll() { setFreq(new Map(customers.map((c) => [c.id, defaultFreq]))); }
  function setRouteFreq(routeId: string, f: JourneyFrequency) {
    setFreq((prev) => { const m = new Map(prev); for (const c of customers) if (c.routeId === routeId) m.set(c.id, f); return m; });
  }
  function setCustFreq(id: string, f: JourneyFrequency) { setFreq((prev) => new Map(prev).set(id, f)); }

  // Plan ALL routes — geography clustering + workload balance, honouring manual frequencies.
  function planAll() {
    const merged = new Map<string, JourneyAssignment>();
    for (const [, { list }] of routes) {
      const jcs: JourneyCustomer[] = list.map((c) => ({ id: c.id, lat: c.lat, lng: c.lng, frequency: freq.get(c.id) ?? 'w1', sales: c.sales }));
      const p = generateJourneyPlan(jcs);
      for (const [k, v] of p.assignments) merged.set(k, v);
    }
    setPlan({ assignments: merged, dayLoads: computeDayLoads(routed(), merged) });
    setApproved(false);
  }

  // Recalculate ONLY the focused route, preserving every other route's assignments.
  function recalcOne() {
    if (!focusRoute) return;
    const list = routes.find(([rid]) => rid === focusRoute)?.[1].list ?? [];
    const jcs: JourneyCustomer[] = list.map((c) => ({ id: c.id, lat: c.lat, lng: c.lng, frequency: freq.get(c.id) ?? 'w1', sales: c.sales }));
    const p = generateJourneyPlan(jcs);
    const merged = new Map(plan?.assignments ?? []);
    for (const [k, v] of p.assignments) merged.set(k, v);
    setPlan({ assignments: merged, dayLoads: computeDayLoads(routed(), merged) });
    setApproved(false);
  }

  function moveSelectedToDay(day: JourneyDay) {
    if (!plan || selectedIds.size === 0) return;
    const merged = new Map(plan.assignments);
    for (const id of selectedIds) {
      const a = merged.get(id);
      if (a) merged.set(id, { ...a, days: [day] });
    }
    setPlan({ assignments: merged, dayLoads: computeDayLoads(routed(), merged) });
    setSelectedIds(new Set());
    setApproved(false);
  }

  function exportJourney() {
    if (!plan) return;
    const ex: JourneyExportCustomer[] = customers.map((c) => ({ id: c.id, lat: c.lat, lng: c.lng, frequency: freq.get(c.id) ?? 'w1', sales: c.sales, code: c.code, name: c.name, routeId: c.routeId, routeLabel: c.routeLabel }));
    const rows = journeyExportRows(ex, plan, dayLabel, hasSales);
    const bytes = buildXlsxWorkbook([{ name: 'Journey Plan', rows }]);
    downloadXlsx(new Blob([bytes as unknown as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'journey-plan.xlsx');
  }

  // Wave C: persist the journey plan to the server (reopen across devices; basis for
  // generating Daily Visit Plans). Serialises the assignments + frequency Maps and embeds
  // the (geo-ordered) customer list so the plan is self-contained.
  async function saveJourney() {
    if (!plan) return;
    setJpSaving(true);
    const assignments = serializeAssignments(plan.assignments as unknown as Map<string, StoredAssignment>);
    const frequencies = serializeFrequencies(freq as unknown as Map<string, string>);
    const custs = customers.map((c) => ({ id: c.id, code: c.code, name: c.name, lat: c.lat, lng: c.lng, routeId: c.routeId, routeLabel: c.routeLabel }));
    const res = await saveJourneyPlan(jpName.trim() || t('routePlanner.jpTitle'), frequencies, { assignments, dayLoads: plan.dayLoads, customers: custs });
    setJpSaving(false);
    if (res.ok) { setJpSaved(true); setJpSavedId(res.data?.id ?? null); setJpName(''); setTimeout(() => setJpSaved(false), 2500); }
  }
  async function submitJourney() {
    if (!jpSavedId) return;
    setJpSaving(true);
    const res = await submitPlanForApproval('journey', jpSavedId);
    setJpSaving(false);
    setJpMsg(res.ok ? t('rpShell.pa_pending') : (res.error === 'err_no_flow' ? t('rpShell.pa_noFlow') : res.error));
  }

  const kpis = useMemo(() => (plan ? journeyRouteKpis(routed(), plan) : []), [plan, freq, customers]); // eslint-disable-line react-hooks/exhaustive-deps
  const warnings = useMemo(() => (plan ? validateJourneyPlan(routed(), plan) : []), [plan, freq, customers]); // eslint-disable-line react-hooks/exhaustive-deps
  const warnLabel = (w: JourneyWarning) => t(`routePlanner.jw_${w.kind}` as Parameters<typeof t>[0]);

  const primaryDayOf = (id: string): JourneyDay | null => plan?.assignments.get(id)?.days[0] ?? null;
  const daysOf = (id: string): JourneyDay[] => plan?.assignments.get(id)?.days ?? [];

  // Map points: coloured by visit day (after planning) or grey, filtered by focused route + day.
  const points = useMemo<SelMapPoint[]>(() => {
    const showRoute = focusRoute && !showAll;
    return customers
      .filter((c) => (!showRoute || c.routeId === focusRoute) && (!dayFilter || daysOf(c.id).includes(dayFilter)))
      .map((c) => {
        const pd = primaryDayOf(c.id);
        const ds = daysOf(c.id);
        return {
          id: c.id, name: c.name, lat: c.lat, lng: c.lng,
          color: pd ? dayColorOf(pd) : '#94a3b8',
          review: ds.length > 1, // multi-day customers get the ring
          meta: { code: c.code, route: c.routeLabel, frequency: `${freqLabel(freq.get(c.id) ?? 'w1')}${ds.length ? ' · ' + ds.map(dayLabel).join(', ') : ''}` },
        };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers, plan, focusRoute, showAll, dayFilter, freq]);

  const dayOptions = JOURNEY_WORKING_DAYS.map((d) => ({ value: d, label: dayLabel(d) }));
  const focusedKpi = focusRoute ? kpis.find((k) => k.routeId === focusRoute) : null;
  const focusList = focusRoute ? (routes.find(([rid]) => rid === focusRoute)?.[1].list ?? []) : [];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Header */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground"><CalendarDays className="h-4 w-4" /></div>
          <p className="text-sm font-bold">{t('routePlanner.jpTitle')}</p>
          {/* Mode toggle */}
          <div className="ms-2 inline-flex overflow-hidden rounded-md border text-xs">
            <button onClick={() => { setMode('all'); setFocusRoute(null); }} className={`px-2.5 py-1 ${mode === 'all' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`}>{t('routePlanner.jpModeAll')}</button>
            <button onClick={() => setMode('one')} className={`border-s px-2.5 py-1 ${mode === 'one' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`}>{t('routePlanner.jpModeOne')}</button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {mode === 'all'
            ? <Button size="sm" onClick={planAll}><Wand2 className="h-4 w-4" /> {plan ? t('routePlanner.jpRegenerate') : t('routePlanner.jpGenerate')}</Button>
            : <Button size="sm" disabled={!focusRoute} onClick={recalcOne}><Wand2 className="h-4 w-4" /> {t('routePlanner.jpRecalcOne')}</Button>}
          {plan && !approved && <Button size="sm" variant="default" onClick={() => setApproved(true)}><Check className="h-4 w-4" /> {t('routePlanner.jpApprove')}</Button>}
          {approved && <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600"><Check className="h-4 w-4" /> {t('routePlanner.jpApproved')}</span>}
          <Button size="sm" variant="outline" disabled={!approved} onClick={exportJourney}><FileDown className="h-4 w-4" /> {t('routePlanner.jpExport')}</Button>
          {plan && (
            <div className="flex items-center gap-1">
              <Input value={jpName} onChange={(e) => setJpName(e.target.value)} placeholder={t('routePlanner.jpSaveName')} className="h-8 w-36 text-xs" />
              <Button size="sm" variant="outline" disabled={jpSaving} onClick={() => void saveJourney()}>
                {jpSaved ? <Check className="h-4 w-4 text-emerald-600" /> : <Save className="h-4 w-4" />} {jpSaved ? t('routePlanner.jpSaved') : t('routePlanner.jpSave')}
              </Button>
              {jpSavedId && (
                <Button size="sm" variant="outline" disabled={jpSaving} onClick={() => void submitJourney()} title={t('rpShell.pa_submit')}>
                  <Send className="h-4 w-4" /> {t('rpShell.pa_submit')}
                </Button>
              )}
            </div>
          )}
          {jpMsg && <span className="text-[11px] text-violet-700">{jpMsg}</span>}
          <Button size="sm" variant="ghost" onClick={onClose}><X className="h-4 w-4" /> {t('routePlanner.cancel')}</Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-2 overflow-hidden p-2 lg:grid-cols-[320px_1fr]">
        {/* Left: routes / KPIs / frequencies / warnings */}
        <Card className="flex min-h-0 flex-col self-stretch">
          <CardContent className="flex min-h-0 flex-1 flex-col gap-2 p-2.5">
            {/* Default frequency + apply all */}
            <div className="flex flex-wrap items-end gap-2 rounded-md border bg-muted/30 p-2">
              <div>
                <label className="block text-[11px] text-muted-foreground">{t('routePlanner.jpDefaultFreq')}</label>
                <select value={defaultFreq} onChange={(e) => setDefaultFreq(e.target.value as JourneyFrequency)} className="h-8 rounded border bg-background px-1 text-xs">
                  {JOURNEY_FREQUENCIES.map((f) => <option key={f} value={f}>{freqLabel(f)}</option>)}
                </select>
              </div>
              <Button size="sm" variant="outline" onClick={applyAll}>{t('routePlanner.jpApplyAll')}</Button>
            </div>

            {/* Day legend (click to filter) */}
            <div className="rounded-md border p-2">
              <p className="mb-1 text-[11px] font-semibold text-muted-foreground">{t('routePlanner.jpLegend')}</p>
              <div className="flex flex-wrap gap-1">
                {JOURNEY_WORKING_DAYS.map((d) => (
                  <button key={d} onClick={() => setDayFilter((x) => (x === d ? null : d))} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${dayFilter === d ? 'border-primary ring-1 ring-primary/40' : 'hover:bg-muted'}`}>
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: dayColorOf(d) }} /> {dayLabel(d)}
                  </button>
                ))}
                {dayFilter && <button onClick={() => setDayFilter(null)} className="rounded-full border px-2 py-0.5 text-[11px] hover:bg-muted">{t('routePlanner.showAll')}</button>}
              </div>
            </div>

            {/* Routes list with KPIs (focus filters the map) */}
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">{t('routePlanner.routesTitle')} <span className="text-xs font-normal text-muted-foreground">({routes.length})</span></p>
              {focusRoute && <label className="inline-flex cursor-pointer items-center gap-1 text-[11px]"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> {t('routePlanner.jpShowAll')}</label>}
            </div>
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pe-1">
              {routes.map(([rid, { label, list }]) => {
                const k = kpis.find((x) => x.routeId === rid);
                const on = focusRoute === rid;
                return (
                  <div key={rid} className={`rounded-lg border ${on ? 'border-primary ring-1 ring-primary/30' : ''}`}>
                    <button onClick={() => setFocusRoute(on ? null : rid)} className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-start">
                      <span className="inline-flex items-center gap-1 text-xs font-medium"><Eye className="h-3.5 w-3.5 opacity-60" /> {label}</span>
                      <span className="text-[11px] text-muted-foreground tabular-nums" dir="ltr">{list.length}{k ? ` · ${k.visitsPerCycle}v · ${k.distanceKm}km · ${k.workloadBalance}%` : ''}</span>
                    </button>
                    {k && (k.uncovered > 0 || k.overloadedDays.length > 0) && (
                      <p className="border-t px-2 py-0.5 text-[10px] text-amber-700">
                        {k.uncovered > 0 && <span>{t('routePlanner.jpUncovered').replace('{n}', String(k.uncovered))} </span>}
                        {k.overloadedDays.length > 0 && <span>{t('routePlanner.jpOverloaded')}: {k.overloadedDays.map(dayLabel).join(', ')}</span>}
                      </p>
                    )}
                    {/* Edit-one-route: per-customer frequency for the focused route */}
                    {on && mode === 'one' && (
                      <div className="max-h-56 space-y-0.5 overflow-y-auto border-t p-1">
                        <div className="flex items-center gap-1 px-1 pb-1">
                          <span className="text-[10px] text-muted-foreground">{t('routePlanner.jpSetAll')}</span>
                          <select value="" onChange={(e) => { if (e.target.value) setRouteFreq(rid, e.target.value as JourneyFrequency); }} className="h-6 rounded border bg-background px-1 text-[11px]">
                            <option value="" disabled>—</option>
                            {JOURNEY_FREQUENCIES.map((f) => <option key={f} value={f}>{freqLabel(f)}</option>)}
                          </select>
                        </div>
                        {list.map((c) => (
                          <div key={c.id} className="flex items-center justify-between gap-1 px-1 text-[11px]">
                            <span className="min-w-0 flex-1 truncate">{c.name}</span>
                            <select value={freq.get(c.id) ?? 'w1'} onChange={(e) => setCustFreq(c.id, e.target.value as JourneyFrequency)} className="h-6 rounded border bg-background px-1 text-[11px]">
                              {JOURNEY_FREQUENCIES.map((f) => <option key={f} value={f}>{freqLabel(f)}</option>)}
                            </select>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Validation warnings */}
            {plan && (
              <details className="rounded-md border" open={warnings.length > 0}>
                <summary className={`cursor-pointer px-2 py-1.5 text-xs font-semibold ${warnings.length ? 'text-amber-700' : 'text-emerald-700'}`}>
                  <AlertTriangle className="me-1 inline h-3.5 w-3.5" />{t('routePlanner.jpWarnings')} ({warnings.length})
                </summary>
                <div className="max-h-40 space-y-0.5 overflow-y-auto border-t p-1 text-[11px]">
                  {warnings.length === 0 && <p className="px-1 py-1 text-emerald-700">{t('routePlanner.jpNoWarnings')}</p>}
                  {warnings.slice(0, 100).map((w, i) => (
                    <p key={i} className="px-1 text-amber-800">
                      • {warnLabel(w)}{w.customerId ? ` — ${byId.get(w.customerId)?.name ?? w.customerId}` : w.detail ? ` — ${w.detail}` : ''}
                    </p>
                  ))}
                  {warnings.length > 100 && <p className="px-1 text-muted-foreground">+{warnings.length - 100}</p>}
                </div>
              </details>
            )}
          </CardContent>
        </Card>

        {/* Center: the map (coloured by visit day) */}
        <div className="relative min-h-0">
          {/* Floating tools: select mode + move selection to a day */}
          <div className="pointer-events-none absolute end-2 top-2 z-[5] flex w-[min(20rem,calc(100%-1rem))] flex-col items-stretch gap-1.5">
            <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 rounded-lg border border-white/50 bg-background/80 px-2 py-1.5 text-xs shadow-md backdrop-blur-md dark:border-white/10">
              <div className="inline-flex overflow-hidden rounded-md border">
                <button onClick={() => setSelectMode('pan')} title={t('routePlanner.panMode')} className={`px-2 py-1 ${selectMode === 'pan' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`}><Hand className="h-3.5 w-3.5" /></button>
                <button onClick={() => setSelectMode('box')} title={t('routePlanner.boxSelect')} className={`border-s px-2 py-1 ${selectMode === 'box' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`}><Square className="h-3.5 w-3.5" /></button>
                <button onClick={() => setSelectMode('draw')} title={t('routePlanner.drawSelect')} className={`border-s px-2 py-1 ${selectMode === 'draw' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`}><PenTool className="h-3.5 w-3.5" /></button>
              </div>
            </div>
            {selectedIds.size > 0 && (
              <div className="pointer-events-auto flex flex-wrap items-center gap-1.5 rounded-lg border border-white/50 bg-background/80 px-2 py-1.5 text-xs shadow-md backdrop-blur-md dark:border-white/10">
                <span className="font-medium">{t('routePlanner.selectedN').replace('{n}', String(selectedIds.size))}</span>
                <span className="text-muted-foreground">{t('routePlanner.jpMoveTo')}</span>
                <select value={moveDay} onChange={(e) => setMoveDay(e.target.value as JourneyDay)} className="h-7 rounded border bg-background px-1 text-[11px]">
                  {JOURNEY_WORKING_DAYS.map((d) => <option key={d} value={d}>{dayLabel(d)}</option>)}
                </select>
                <Button size="sm" onClick={() => moveSelectedToDay(moveDay)}><MapPin className="h-3.5 w-3.5" /> {t('routePlanner.apply')}</Button>
                <button onClick={() => setSelectedIds(new Set())} className="rounded border px-1.5 py-0.5 hover:bg-muted"><X className="h-3.5 w-3.5" /></button>
              </div>
            )}
          </div>
          {!plan ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><CalendarDays className="h-6 w-6" /></div>
              <p className="text-base font-semibold">{t('routePlanner.jpEmpty')}</p>
              <p className="max-w-xs text-sm text-muted-foreground">{t('routePlanner.jpEmptyHint')}</p>
              <Button size="sm" onClick={planAll}><Wand2 className="h-4 w-4" /> {t('routePlanner.jpGenerate')}</Button>
            </div>
          ) : (
            <SelectionMap
              points={points} hulls={[]} selectedIds={selectedIds} focusIds={new Set()}
              routeOptions={dayOptions} selectMode={selectMode} fill
              onToggle={(id) => setSelectedIds((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; })}
              onBoxSelect={(ids) => setSelectedIds((s) => new Set([...s, ...ids]))}
              onMoveSingle={(id, day) => { if (!plan) return; const m = new Map(plan.assignments); const a = m.get(id); if (a) m.set(id, { ...a, days: [day as JourneyDay] }); setPlan({ assignments: m, dayLoads: computeDayLoads(routed(), m) }); setApproved(false); }}
              onContextMenu={() => {}}
              onSelecting={() => {}}
              onSelectComplete={() => setSelectMode('pan')}
            />
          )}
        </div>
      </div>

      {/* footnote: focused-route summary + total */}
      <div className="shrink-0 border-t px-4 py-1.5 text-[11px] text-muted-foreground">
        {focusedKpi
          ? <span>{routes.find(([rid]) => rid === focusRoute)?.[1].label}: {focusedKpi.customers} {t('routePlanner.jpCust')} · {focusedKpi.visitsPerCycle} {t('routePlanner.jpVisits')} · {focusedKpi.distanceKm} km · {t('routePlanner.colWorkload')} {focusedKpi.workloadBalance}%</span>
          : <span>{customers.length} {t('routePlanner.jpCust')} · {routes.length} {t('routePlanner.routesTitle')}{plan ? ` · ${customers.reduce((s, c) => s + visitsPerCycle(freq.get(c.id) ?? 'w1'), 0)} ${t('routePlanner.jpVisits')}` : ''}</span>}
      </div>
    </div>
  );
}
