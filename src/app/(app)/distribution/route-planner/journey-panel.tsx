'use client';

import { useMemo, useState } from 'react';
import { X, Wand2, Check, FileDown, CalendarDays, ChevronDown, ChevronRight } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { buildXlsxWorkbook } from '@/lib/erp/xlsx-write';
import {
  generateJourneyPlan, computeDayLoads, moveCustomerToDay, journeyExportRows,
  JOURNEY_FREQUENCIES, JOURNEY_WORKING_DAYS, weekPatternLabel,
  type JourneyFrequency, type JourneyCustomer, type JourneyPlan, type JourneyDay, type JourneyExportCustomer,
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
 * Journey Planning V1 — manager sets frequencies, the system suggests a geography-aware,
 * workload-balanced weekly plan, the manager adjusts (move day / change freq / regenerate),
 * approves and exports. Renders as a full-screen overlay over the planner.
 */
export function JourneyPanel({ customers, hasSales, onClose }: { customers: JourneyInputCustomer[]; hasSales: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const [freq, setFreq] = useState<Map<string, JourneyFrequency>>(() => new Map(customers.map((c) => [c.id, 'w1' as JourneyFrequency])));
  const [defaultFreq, setDefaultFreq] = useState<JourneyFrequency>('w1');
  const [plan, setPlan] = useState<JourneyPlan | null>(null);
  const [approved, setApproved] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const routes = useMemo(() => {
    const m = new Map<string, { label: string; list: JourneyInputCustomer[] }>();
    for (const c of customers) {
      if (!m.has(c.routeId)) m.set(c.routeId, { label: c.routeLabel, list: [] });
      m.get(c.routeId)!.list.push(c);
    }
    return [...m.entries()].sort((a, b) => a[1].label.localeCompare(b[1].label));
  }, [customers]);

  const allJC = (): JourneyCustomer[] => customers.map((c) => ({ id: c.id, lat: c.lat, lng: c.lng, frequency: freq.get(c.id) ?? 'w1', sales: c.sales }));
  const freqLabel = (f: JourneyFrequency) => t(`routePlanner.jpFreq_${f}` as Parameters<typeof t>[0]);
  const dayLabel = (d: JourneyDay) => t(`routePlanner.jpDay_${d}` as Parameters<typeof t>[0]);

  function applyAll() { setFreq(new Map(customers.map((c) => [c.id, defaultFreq]))); setPlan(null); setApproved(false); }
  function setRouteFreq(routeId: string, f: JourneyFrequency) {
    setFreq((prev) => { const m = new Map(prev); for (const c of customers) if (c.routeId === routeId) m.set(c.id, f); return m; });
    setPlan(null); setApproved(false);
  }
  function setCustFreq(id: string, f: JourneyFrequency) { setFreq((prev) => new Map(prev).set(id, f)); setPlan(null); setApproved(false); }

  function generate() {
    const merged = new Map(plan?.assignments ?? []);
    merged.clear();
    for (const [rid, { list }] of routes) {
      void rid;
      const jcs: JourneyCustomer[] = list.map((c) => ({ id: c.id, lat: c.lat, lng: c.lng, frequency: freq.get(c.id) ?? 'w1', sales: c.sales }));
      const p = generateJourneyPlan(jcs);
      for (const [k, v] of p.assignments) merged.set(k, v);
    }
    setPlan({ assignments: merged, dayLoads: computeDayLoads(allJC(), merged) });
    setApproved(false);
  }

  function moveTo(id: string, day: JourneyDay) {
    if (!plan) return;
    setPlan(moveCustomerToDay(plan, allJC(), id, day));
    setApproved(false);
  }

  function exportJourney() {
    if (!plan) return;
    const ex: JourneyExportCustomer[] = customers.map((c) => ({ id: c.id, lat: c.lat, lng: c.lng, frequency: freq.get(c.id) ?? 'w1', sales: c.sales, code: c.code, name: c.name, routeLabel: c.routeLabel }));
    const rows = journeyExportRows(ex, plan, dayLabel, hasSales);
    const bytes = buildXlsxWorkbook([{ name: 'Journey Plan', rows }]);
    const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    downloadXlsx(blob, 'journey-plan.xlsx');
  }

  // Customers per day (a customer can appear on several days).
  const byDay = useMemo(() => {
    const m = new Map<JourneyDay, { c: JourneyInputCustomer; weeks: number[] }[]>();
    for (const d of JOURNEY_WORKING_DAYS) m.set(d, []);
    if (plan) {
      const byId = new Map(customers.map((c) => [c.id, c]));
      for (const a of plan.assignments.values()) {
        const c = byId.get(a.customerId); if (!c) continue;
        for (const d of a.days) m.get(d)?.push({ c, weeks: a.weeks });
      }
    }
    return m;
  }, [plan, customers]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground"><CalendarDays className="h-4 w-4" /></div>
          <p className="text-sm font-bold">{t('routePlanner.jpTitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          {plan && !approved && <Button size="sm" variant="default" onClick={() => setApproved(true)}><Check className="h-4 w-4" /> {t('routePlanner.jpApprove')}</Button>}
          {approved && <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600"><Check className="h-4 w-4" /> {t('routePlanner.jpApproved')}</span>}
          <Button size="sm" variant="outline" disabled={!approved} onClick={exportJourney}><FileDown className="h-4 w-4" /> {t('routePlanner.jpExport')}</Button>
          <Button size="sm" variant="ghost" onClick={onClose}><X className="h-4 w-4" /> {t('routePlanner.cancel')}</Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 overflow-hidden p-3 lg:grid-cols-[340px_1fr]">
        {/* Step 1: frequencies */}
        <Card className="flex min-h-0 flex-col">
          <CardContent className="flex min-h-0 flex-1 flex-col gap-2 p-3">
            <p className="text-sm font-semibold">{t('routePlanner.jpStep1')}</p>
            <div className="flex flex-wrap items-end gap-2 rounded-md border bg-muted/30 p-2">
              <div>
                <label className="block text-[11px] text-muted-foreground">{t('routePlanner.jpDefaultFreq')}</label>
                <select value={defaultFreq} onChange={(e) => setDefaultFreq(e.target.value as JourneyFrequency)} className="h-8 rounded border bg-background px-2 text-xs">
                  {JOURNEY_FREQUENCIES.map((f) => <option key={f} value={f}>{freqLabel(f)}</option>)}
                </select>
              </div>
              <Button size="sm" variant="outline" onClick={applyAll}>{t('routePlanner.jpApplyAll')}</Button>
            </div>
            <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pe-1">
              {routes.map(([rid, { label, list }]) => (
                <div key={rid} className="rounded border">
                  <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                    <button onClick={() => setExpanded((e) => (e === rid ? null : rid))} className="inline-flex items-center gap-1 text-xs font-medium">
                      {expanded === rid ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      {label} <span className="text-muted-foreground">({list.length})</span>
                    </button>
                    <select onChange={(e) => setRouteFreq(rid, e.target.value as JourneyFrequency)} value="" className="h-7 rounded border bg-background px-1 text-[11px]">
                      <option value="" disabled>{t('routePlanner.jpSetAll')}</option>
                      {JOURNEY_FREQUENCIES.map((f) => <option key={f} value={f}>{freqLabel(f)}</option>)}
                    </select>
                  </div>
                  {expanded === rid && (
                    <div className="max-h-60 space-y-0.5 overflow-y-auto border-t p-1">
                      {list.map((c) => (
                        <div key={c.id} className="flex items-center justify-between gap-2 px-1 text-xs">
                          <span className="min-w-0 flex-1 truncate">{c.name}</span>
                          <select value={freq.get(c.id) ?? 'w1'} onChange={(e) => setCustFreq(c.id, e.target.value as JourneyFrequency)} className="h-6 rounded border bg-background px-1 text-[11px]">
                            {JOURNEY_FREQUENCIES.map((f) => <option key={f} value={f}>{freqLabel(f)}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <Button size="sm" onClick={generate}><Wand2 className="h-4 w-4" /> {plan ? t('routePlanner.jpRegenerate') : t('routePlanner.jpGenerate')}</Button>
          </CardContent>
        </Card>

        {/* Step 2: day board */}
        <Card className="flex min-h-0 flex-col">
          <CardContent className="flex min-h-0 flex-1 flex-col gap-2 p-3">
            <p className="text-sm font-semibold">{t('routePlanner.jpStep2')}</p>
            {!plan ? (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">{t('routePlanner.jpEmpty')}</div>
            ) : (
              <div className="grid min-h-0 flex-1 gap-2 overflow-x-auto md:grid-cols-2 xl:grid-cols-3">
                {JOURNEY_WORKING_DAYS.map((d) => {
                  const load = plan.dayLoads.find((l) => l.day === d)!;
                  const list = byDay.get(d) ?? [];
                  return (
                    <div key={d} className="flex min-h-0 flex-col rounded-lg border">
                      <div className="shrink-0 border-b bg-muted/40 px-2 py-1.5">
                        <p className="text-xs font-bold">{dayLabel(d)}</p>
                        <p className="text-[10px] text-muted-foreground tabular-nums" dir="ltr">
                          {load.customers} {t('routePlanner.jpCust')} · {load.visitsPerWeek.toFixed(1)}/wk · {Math.round(load.workloadMin)}m{hasSales ? ` · ${Math.round(load.sales).toLocaleString()}` : ''}
                        </p>
                      </div>
                      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-1">
                        {list.length === 0 && <p className="py-3 text-center text-[11px] text-muted-foreground">—</p>}
                        {list.slice(0, 200).map(({ c, weeks }, i) => (
                          <div key={`${c.id}-${i}`} className="flex items-center gap-1 rounded px-1 py-0.5 text-[11px] hover:bg-muted">
                            <span className="min-w-0 flex-1 truncate" title={`${c.routeLabel} · ${freqLabel(freq.get(c.id) ?? 'w1')} · ${weekPatternLabel(weeks)}`}>{c.name}</span>
                            <select value="" onChange={(e) => { if (e.target.value) moveTo(c.id, e.target.value as JourneyDay); }} className="h-5 rounded border bg-background text-[10px]" title={t('routePlanner.jpMoveTo')}>
                              <option value="">↦</option>
                              {JOURNEY_WORKING_DAYS.filter((x) => x !== d).map((x) => <option key={x} value={x}>{dayLabel(x)}</option>)}
                            </select>
                          </div>
                        ))}
                        {list.length > 200 && <p className="py-1 text-center text-[10px] text-muted-foreground">+{list.length - 200}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
