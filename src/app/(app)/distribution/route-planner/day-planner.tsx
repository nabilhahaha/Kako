'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Upload, Wand2, FileDown, Share2, Printer, Map as MapIcon, ArrowUp, ArrowDown, RotateCcw, Trash2, LassoSelect, Check, Save, Search, Link2, Smartphone, Navigation, Square, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { buildXlsxWorkbook } from '@/lib/erp/xlsx-write';
import { type JourneyPoint } from '@/lib/tis/journey';
import {
  DP_FIELDS, DP_REQUIRED_FIELDS, suggestDpMapping, validateDpImport,
  routeMetrics, formatDistanceKm, formatDriveMinutes, nearestNeighbourOrder,
  type DpMapping, type DpCustomer,
} from '@/lib/tis/day-planner-import';
import { parseUploadColumns } from './import-actions';
import { ImportMapper, RejectedRowsBar } from './import-mapper';
import { DayPlannerMap, type DayMapPoint, type DayMapEndpoint, type DaySelectMode } from './day-planner-map';
import { loadDpTemplates, saveDpTemplate, deleteDpTemplate, findBestTemplate, type DpTemplate } from './day-planner-templates';
import { saveDayPlannerDraft, loadDayPlannerDraft, clearDayPlannerDraft, type DayPlannerDraft } from './day-planner-draft';
import { loadDpPlans, saveDpPlan, deleteDpPlan, getDpPlan, planShareUrl, type DpSavedPlan } from './day-planner-plans';
import { loadSegments, filterBySegment, type RpSegment } from './route-planner-segments';
import { getDpLocation, setDpLocation, type DpLocationKey } from './day-planner-locations';

/** Estimated minutes spent at each stop (service time), used for the day-effort estimate. */
const VISIT_MIN = 15;

type StartKind = 'current' | 'warehouse' | 'office' | 'customer' | 'map';
type EndKind = 'last' | 'warehouse' | 'office' | 'customer' | 'map';

function downloadXlsx(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const stopNavUrl = (c: { lat: number; lng: number }) => `https://www.google.com/maps/dir/?api=1&destination=${c.lat},${c.lng}&travelmode=driving`;

/**
 * Day Planner — "build today's visit route in under 2 minutes". Three sources feed ONE
 * flow: Select customers (existing dataset / map box+polygon / Excel upload) → Review
 * count + distance + time → Generate → Save / Share / Print. Designed for managers &
 * field users, not GIS power-users.
 */
export function DayPlanner({ hasSalesDefault = false, seedCustomers, autoUseDataset = false, embedded = false, onClose }: {
  hasSalesDefault?: boolean;
  seedCustomers?: DpCustomer[];
  autoUseDataset?: boolean;
  /** When true, the Day Planner fills its container (inside the dashboard shell) instead
   *  of being a full-screen overlay — the sidebar + top bar stay visible. */
  embedded?: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<'upload' | 'map' | 'plan'>('upload');
  // Upload/mapping
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [records, setRecords] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<DpMapping>({});
  const [appliedTemplate, setAppliedTemplate] = useState<string | null>(null);
  const [templates, setTemplates] = useState<DpTemplate[]>([]);
  const [tplName, setTplName] = useState('');
  const [showRejected, setShowRejected] = useState(false);
  // Plan
  const [customers, setCustomers] = useState<DpCustomer[]>([]);
  const [hasSales, setHasSales] = useState(hasSalesDefault);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [selectMode, setSelectMode] = useState<DaySelectMode>('none');
  const [pendingSel, setPendingSel] = useState<string[] | null>(null);
  // Start / End
  const [startKind, setStartKind] = useState<StartKind>('current');
  const [endKind, setEndKind] = useState<EndKind>('last');
  const [start, setStart] = useState<JourneyPoint | null>(null);
  const [end, setEnd] = useState<JourneyPoint | null>(null);
  const [picking, setPicking] = useState<null | { which: 'start' | 'end' } | { setLoc: DpLocationKey; which: 'start' | 'end' }>(null);
  const [geoBusy, setGeoBusy] = useState(false);
  // Result
  const [confirming, setConfirming] = useState(false);
  const [order, setOrder] = useState<string[] | null>(null);
  const [plans, setPlans] = useState<DpSavedPlan[]>([]);
  const [planName, setPlanName] = useState('');
  const [savedId, setSavedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [mobileView, setMobileView] = useState(false);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [segments, setSegments] = useState<RpSegment[]>([]);
  const [pendingDraft, setPendingDraft] = useState<DayPlannerDraft | null>(null);
  const decided = useRef(false);

  useEffect(() => { setTemplates(loadDpTemplates()); setPlans(loadDpPlans()); setSegments(loadSegments()); }, []);

  // ── On mount: a ?plan=<id> link reopens a saved plan; else offer draft recovery;
  //    else (dataset present) open straight onto it. ──
  useEffect(() => {
    let on = true;
    (async () => {
      const planId = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('plan') : null;
      if (planId) {
        const p = getDpPlan(planId);
        if (p && on) { openSavedPlan(p); decided.current = true; return; }
      }
      const d = await loadDayPlannerDraft();
      if (!on) return;
      if (d && (d.records.length > 0 || d.customers.length > 0)) setPendingDraft(d);
      else {
        decided.current = true;
        if (autoUseDataset && seedCustomers && seedCustomers.length > 0) useDataset(false);
      }
    })();
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Autosave (debounced). ──
  useEffect(() => {
    if (!decided.current) return;
    if (records.length === 0 && customers.length === 0) return;
    const id = setTimeout(() => {
      void saveDayPlannerDraft({ v: 1, savedAt: Date.now(), step, fileName, headers, records, mapping, customers, hasSales, selectedIds: [...selectedIds], start, end, order });
    }, 600);
    return () => clearTimeout(id);
  }, [step, fileName, headers, records, mapping, customers, hasSales, selectedIds, start, end, order]);

  // ── Unsaved-work guard. ──
  useEffect(() => {
    const dirty = records.length > 0 || customers.length > 0;
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [records.length, customers.length]);

  function restoreDraft() {
    const d = pendingDraft; if (!d) return;
    setStep(d.step); setFileName(d.fileName); setHeaders(d.headers); setRecords(d.records); setMapping(d.mapping);
    setCustomers(d.customers); setHasSales(d.hasSales); setSelectedIds(new Set(d.selectedIds));
    setStart(d.start); setEnd(d.end); setOrder(d.order);
    decided.current = true; setPendingDraft(null);
  }
  function discardDraft() { void clearDayPlannerDraft(); decided.current = true; setPendingDraft(null); }

  const byId = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);
  const planned = useMemo(() => (selectedIds.size ? customers.filter((c) => selectedIds.has(c.id)) : customers), [customers, selectedIds]);
  const validation = useMemo(() => validateDpImport(records, mapping), [records, mapping]);
  const requiredMapped = DP_REQUIRED_FIELDS.every((k) => !!mapping[k]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => c.name.toLowerCase().includes(q) || (c.code ?? '').toLowerCase().includes(q) || (c.city ?? '').toLowerCase().includes(q));
  }, [customers, search]);

  // ── Sources ──
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setImporting(true); setMsg(null);
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await parseUploadColumns(fd);
      if (!res.ok) { setMsg(t('dayPlanner.uploadErr')); return; }
      const tpl = findBestTemplate(res.headers);
      setFileName(file.name); setHeaders(res.headers); setRecords(res.records);
      setMapping(tpl ? tpl.mapping : suggestDpMapping(res.headers)); setAppliedTemplate(tpl ? tpl.name : null);
      decided.current = true; setStep('map');
    } catch { setMsg(t('dayPlanner.uploadErr')); }
    finally { setImporting(false); if (fileRef.current) fileRef.current.value = ''; }
  }
  function continueFromMapping() {
    if (!requiredMapped || validation.valid === 0) return;
    loadIntoPlan(validation.customers);
  }
  function useDataset(startDrawing: boolean) {
    if (!seedCustomers || seedCustomers.length === 0) return;
    loadIntoPlan(seedCustomers);
    if (startDrawing) setSelectMode('box');
  }
  function useSegment(s: RpSegment) {
    if (!seedCustomers || seedCustomers.length === 0) return;
    const subset = filterBySegment(seedCustomers, s.filter);
    if (subset.length === 0) { setMsg(t('dayPlanner.segEmpty')); return; }
    loadIntoPlan(subset);
  }
  function loadIntoPlan(cs: DpCustomer[]) {
    decided.current = true;
    setCustomers(cs); setHasSales(cs.some((c) => (c.sales ?? 0) > 0) || hasSalesDefault);
    setSelectedIds(new Set()); setStart(null); setEnd(null); setOrder(null); setConfirming(false);
    setStartKind('current'); setEndKind('last'); setStep('plan');
  }

  // ── Selection (click / box / polygon, with Add/Replace prompt) ──
  function applySelection(ids: string[], additive: boolean) {
    if (ids.length === 0) return;
    setOrder(null);
    if (additive) { setSelectedIds((s) => { const n = new Set(s); ids.forEach((i) => n.add(i)); return n; }); return; }
    if (selectedIds.size === 0) { setSelectedIds(new Set(ids)); return; }
    setPendingSel(ids); // ask Add vs Replace
  }
  function resolvePending(mode: 'add' | 'replace') {
    if (!pendingSel) return;
    if (mode === 'add') setSelectedIds((s) => { const n = new Set(s); pendingSel.forEach((i) => n.add(i)); return n; });
    else setSelectedIds(new Set(pendingSel));
    setPendingSel(null); setOrder(null);
  }
  function clearSelection() { setSelectedIds(new Set()); setOrder(null); }
  function removeFromSelection(id: string) { setSelectedIds((s) => { const n = new Set(s); n.delete(id); return n; }); setOrder(null); }

  // Quick-filter facets (City / Salesman / Channel / Class) — distinct values with
  // counts, so a user can build a route for a segment in one click.
  const facets = useMemo(() => {
    const make = (key: 'city' | 'salesman' | 'channel' | 'class'): [string, number][] => {
      const m = new Map<string, number>();
      for (const c of customers) { const v = ((c[key] ?? '') as string).toString().trim(); if (v) m.set(v, (m.get(v) ?? 0) + 1); }
      return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };
    return { city: make('city'), salesman: make('salesman'), channel: make('channel'), class: make('class') };
  }, [customers]);
  const hasFacets = facets.city.length + facets.salesman.length + facets.channel.length + facets.class.length > 0;
  function selectByFacet(key: 'city' | 'salesman' | 'channel' | 'class', value: string) {
    const ids = customers.filter((c) => ((c[key] ?? '') as string).toString().trim() === value).map((c) => c.id);
    applySelection(ids, false);
  }

  // ── Start / End ──
  function resolveStartKind(kind: StartKind) {
    setStartKind(kind); setOrder(null);
    if (kind === 'current') {
      setGeoBusy(true); setMsg(null);
      navigator.geolocation?.getCurrentPosition(
        (pos) => { setStart({ lat: pos.coords.latitude, lng: pos.coords.longitude, name: t('dayPlanner.sk_current') }); setGeoBusy(false); },
        () => { setGeoBusy(false); setMsg(t('dayPlanner.geoErr')); },
        { enableHighAccuracy: true, timeout: 10000 },
      );
    } else if (kind === 'warehouse' || kind === 'office') {
      const saved = getDpLocation(kind);
      if (saved) setStart(saved);
      else { setPicking({ setLoc: kind, which: 'start' }); }
    } else if (kind === 'map') { setPicking({ which: 'start' }); setSelectMode('none'); }
    // 'customer' → handled by the customer <select> below
  }
  function resolveEndKind(kind: EndKind) {
    setEndKind(kind); setOrder(null);
    if (kind === 'last') setEnd(null);
    else if (kind === 'warehouse' || kind === 'office') {
      const saved = getDpLocation(kind);
      if (saved) setEnd(saved); else setPicking({ setLoc: kind, which: 'end' });
    } else if (kind === 'map') { setPicking({ which: 'end' }); setSelectMode('none'); }
  }
  function onMapClick(lat: number, lng: number) {
    if (!picking) return;
    const pt = { lat, lng, name: t('dayPlanner.mapPoint') };
    if ('setLoc' in picking) { setDpLocation(picking.setLoc, pt); if (picking.which === 'start') setStart(pt); else setEnd(pt); }
    else if (picking.which === 'start') setStart(pt); else setEnd(pt);
    setPicking(null); setOrder(null);
  }
  function useCustomerAs(which: 'start' | 'end', id: string) {
    const c = byId.get(id); if (!c) return;
    const pt = { lat: c.lat, lng: c.lng, name: c.name };
    if (which === 'start') { setStart(pt); setStartKind('customer'); } else { setEnd(pt); setEndKind('customer'); }
    setOrder(null);
  }

  // ── Generate / metrics ──
  // Start point defaults to the centre of the planned customers, so "Review" is enabled
  // as soon as customers are selected — the user never has to fiddle with a Start point
  // unless they want to (Current Location / Warehouse / etc. just override this).
  const centroid = useMemo(() => {
    if (planned.length === 0) return null;
    const la = planned.reduce((s, c) => s + c.lat, 0) / planned.length;
    const ln = planned.reduce((s, c) => s + c.lng, 0) / planned.length;
    return { lat: la, lng: ln, name: t('dayPlanner.sk_center') };
  }, [planned, t]);
  const effStart = start ?? centroid;
  const endReady = endKind === 'last' || !!end;
  const canReview = planned.length > 0 && endReady;

  const previewOrder = useMemo(() => {
    if (!effStart || planned.length === 0) return [];
    return nearestNeighbourOrder(planned.map((c) => ({ id: c.id, lat: c.lat, lng: c.lng })), effStart, endKind === 'last' ? null : end);
  }, [planned, effStart, end, endKind]);

  const metricsFor = (ids: string[]) => {
    if (!effStart || ids.length === 0) return { distanceKm: 0, driveMinutes: 0 };
    const pts = [{ lat: effStart.lat, lng: effStart.lng }, ...ids.map((id) => byId.get(id)!).filter(Boolean).map((c) => ({ lat: c.lat, lng: c.lng }))];
    if (endKind !== 'last' && end) pts.push({ lat: end.lat, lng: end.lng });
    return routeMetrics(pts);
  };
  const previewMetrics = useMemo(() => metricsFor(previewOrder), [previewOrder, effStart, end, endKind]); // eslint-disable-line react-hooks/exhaustive-deps
  const resultMetrics = useMemo(() => metricsFor(order ?? []), [order, effStart, end, endKind]); // eslint-disable-line react-hooks/exhaustive-deps
  const visitMinutes = (order?.length ?? 0) * VISIT_MIN;

  function review() { if (canReview) { setConfirming(true); setMsg(null); } else setMsg(t('dayPlanner.needSelectStart')); }
  function generate() { setOrder(previewOrder); setConfirming(false); setSavedId(null); }
  function move(idx: number, dir: -1 | 1) {
    if (!order) return; const j = idx + dir; if (j < 0 || j >= order.length) return;
    const next = [...order]; [next[idx], next[j]] = [next[j], next[idx]]; setOrder(next);
  }
  function regenerate() { setOrder(previewOrder); }

  // ── Saved plans ──
  function onSavePlan() {
    if (!order || !planName.trim()) return;
    const subset = order.map((id) => byId.get(id)!).filter(Boolean);
    const { plans: next, id } = saveDpPlan(planName, { customers: subset, order, start, end, hasSales });
    setPlans(next); setSavedId(id); setPlanName('');
  }
  function openSavedPlan(p: DpSavedPlan) {
    setCustomers(p.customers); setHasSales(p.hasSales); setSelectedIds(new Set());
    setStart(p.start); setEnd(p.end); setEndKind(p.end ? 'customer' : 'last'); setStartKind(p.start ? 'map' : 'current');
    setOrder(p.order); setConfirming(false); setSavedId(p.id); setStep('plan');
  }
  function onDeletePlan(id: string) { setPlans(deleteDpPlan(id)); if (savedId === id) setSavedId(null); }

  async function copyLink() {
    let url = '';
    if (savedId) url = planShareUrl(savedId);
    else { const subset = order!.map((id) => byId.get(id)!).filter(Boolean); const { id } = saveDpPlan(planName.trim() || t('dayPlanner.untitledPlan'), { customers: subset, order: order!, start, end, hasSales }); setPlans(loadDpPlans()); setSavedId(id); url = id ? planShareUrl(id) : ''; }
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setMsg(url); }
  }

  // ── Derived map data ──
  const orderedList = order ? order.map((id) => byId.get(id)).filter(Boolean) as DpCustomer[] : [];
  const path: [number, number][] = useMemo(() => {
    if (!order || !effStart) return [];
    const pts: [number, number][] = [[effStart.lng, effStart.lat], ...orderedList.map((c) => [c.lng, c.lat] as [number, number])];
    if (endKind !== 'last' && end) pts.push([end.lng, end.lat]);
    return pts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, effStart, end, endKind, customers]);
  const mapPoints: DayMapPoint[] = useMemo(() => {
    const seqOf = new Map(order ? order.map((id, i) => [id, i + 1]) : []);
    return customers.map((c) => ({ id: c.id, name: c.name, lat: c.lat, lng: c.lng, seq: seqOf.get(c.id) }));
  }, [customers, order]);
  const endpoints: DayMapEndpoint[] = [
    ...(order && effStart ? [{ lat: effStart.lat, lng: effStart.lng, kind: 'start' as const }] : []),
    ...(endKind !== 'last' && end ? [{ lat: end.lat, lng: end.lng, kind: 'end' as const }] : []),
  ];

  function gmapsUrl(): string {
    if (!order || !effStart) return '';
    const stops = orderedList.slice(0, 23);
    const wp = stops.map((c) => `${c.lat},${c.lng}`).join('|');
    const dest = endKind !== 'last' && end ? `${end.lat},${end.lng}` : (orderedList.length ? `${orderedList[orderedList.length - 1].lat},${orderedList[orderedList.length - 1].lng}` : `${effStart.lat},${effStart.lng}`);
    return `https://www.google.com/maps/dir/?api=1&origin=${effStart.lat},${effStart.lng}&destination=${dest}${wp ? `&waypoints=${encodeURIComponent(wp)}` : ''}&travelmode=driving`;
  }
  function exportExcel() {
    if (!order) return;
    const header = ['Sequence', 'Customer Code', 'Customer Name', 'Phone', 'Address', 'City', 'Latitude', 'Longitude'];
    if (hasSales) header.push('Sales');
    const rows: (string | number)[][] = [header];
    orderedList.forEach((c, i) => { const r: (string | number)[] = [i + 1, c.code ?? '', c.name, c.phone ?? '', c.address ?? '', c.city ?? '', c.lat, c.lng]; if (hasSales) r.push(c.sales ?? 0); rows.push(r); });
    downloadXlsx(buildXlsxWorkbook([{ name: 'Day Plan', rows }]), 'day-plan.xlsx');
  }
  function shareWhatsApp() {
    if (!order) return;
    const lines = orderedList.map((c, i) => `${i + 1}. ${c.name}${c.phone ? ` — ${c.phone}` : ''}`).join('\n');
    const summary = `${formatDistanceKm(resultMetrics.distanceKm)} · ${formatDriveMinutes(resultMetrics.driveMinutes)}`;
    const text = `${t('dayPlanner.title')} (${orderedList.length})\n${summary}\n\n${lines}\n\n${t('dayPlanner.mapsLink')}: ${gmapsUrl()}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  }
  function downloadRejected() {
    if (validation.rejected.length === 0) return;
    const lbl: Record<string, string> = { missing_coords: t('dayPlanner.rMissing'), invalid_coords: t('dayPlanner.rInvalid'), duplicate: t('dayPlanner.rDuplicate') };
    const rows: (string | number)[][] = [['Row', 'Customer Code', 'Customer Name', 'Reason']];
    for (const r of validation.rejected) rows.push([r.row, r.code ?? '', r.name, lbl[r.reason] ?? r.reason]);
    downloadXlsx(buildXlsxWorkbook([{ name: 'Rejected Rows', rows }]), 'day-plan-rejected.xlsx');
  }
  function resetAll() {
    void clearDayPlannerDraft();
    setStep('upload'); setFileName(null); setHeaders([]); setRecords([]); setMapping({});
    setCustomers([]); setSelectedIds(new Set()); setStart(null); setEnd(null); setOrder(null);
    setSelectMode('none'); setConfirming(false); setSavedId(null); setMsg(null);
  }

  const hasSeed = !!seedCustomers && seedCustomers.length > 0;
  const selCount = selectedIds.size;

  return (
    <div className={embedded ? 'relative flex h-full w-full flex-col overflow-hidden bg-background' : 'fixed inset-0 z-50 flex flex-col bg-background'}>
      <input ref={fileRef} type="file" accept=".csv,.xlsx,.json,.txt" className="hidden" onChange={onFile} />

      {/* Header */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-2 print:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground"><MapIcon className="h-4 w-4" /></div>
          <p className="text-sm font-bold">{t('dayPlanner.title')}</p>
          {step !== 'upload' && <button onClick={resetAll} className="ms-1 rounded border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted">{t('dayPlanner.startOver')}</button>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {step === 'plan' && order && <>
            <Button size="sm" onClick={shareWhatsApp}><Share2 className="h-4 w-4" /> {t('dayPlanner.share')}</Button>
            <Button size="sm" variant="outline" onClick={() => setMobileView(true)}><Smartphone className="h-4 w-4" /> {t('dayPlanner.mobileView')}</Button>
            <Button size="sm" variant="outline" onClick={copyLink}><Link2 className="h-4 w-4" /> {copied ? t('dayPlanner.copied') : t('dayPlanner.copyLink')}</Button>
            <Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" /> {t('dayPlanner.printPdf')}</Button>
            <Button size="sm" variant="ghost" onClick={exportExcel}><FileDown className="h-4 w-4" /> Excel</Button>
          </>}
          {!embedded && <Button size="sm" variant="ghost" onClick={onClose}><X className="h-4 w-4" /> {t('routePlanner.cancel')}</Button>}
        </div>
      </div>

      {/* Draft recovery */}
      {pendingDraft && (
        <div className="flex flex-wrap items-center gap-2 border-b bg-amber-50 px-4 py-2 text-xs text-amber-900 print:hidden">
          <RotateCcw className="h-4 w-4" /><span>{t('dayPlanner.draftFound')}</span>
          <button onClick={restoreDraft} className="rounded bg-amber-600 px-2 py-1 font-medium text-white hover:bg-amber-700">{t('dayPlanner.restore')}</button>
          <button onClick={discardDraft} className="rounded border border-amber-300 px-2 py-1 hover:bg-amber-100">{t('dayPlanner.discard')}</button>
        </div>
      )}

      {/* STEP: source picker */}
      {step === 'upload' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-5 overflow-y-auto p-6">
          <div className="w-full max-w-xl space-y-4">
            <div className="text-center">
              <MapIcon className="mx-auto h-9 w-9 text-primary" />
              <p className="mt-2 text-sm text-muted-foreground">{t('dayPlanner.intro')}</p>
            </div>

            {/* Primary action — focused on the goal (build a route), not the data source. */}
            {hasSeed ? (
              <button onClick={() => useDataset(false)} className="flex w-full items-center gap-4 rounded-2xl border-2 border-primary bg-primary/5 p-5 text-start transition hover:bg-primary/10">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Wand2 className="h-6 w-6" /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-bold">{t('dayPlanner.buildToday')}</p>
                  <p className="text-xs text-muted-foreground">{t('dayPlanner.buildTodayHint').replace('{n}', String(seedCustomers!.length))}</p>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-primary rtl:rotate-180" />
              </button>
            ) : (
              <button onClick={() => fileRef.current?.click()} disabled={importing} className="flex w-full items-center gap-4 rounded-2xl border-2 border-primary bg-primary/5 p-5 text-start hover:bg-primary/10 disabled:opacity-60">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Upload className="h-6 w-6" /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-bold">{importing ? t('routePlanner.importing') : t('dayPlanner.srcUpload')}</p>
                  <p className="text-xs text-muted-foreground">{t('dayPlanner.srcUploadHint')}</p>
                </div>
              </button>
            )}

            {/* Plan a saved segment — pick a named segment to plan its customers. */}
            {hasSeed && segments.length > 0 && (
              <div className="rounded-xl border p-3">
                <p className="mb-2 text-xs font-semibold text-muted-foreground">{t('dayPlanner.planSegment')}</p>
                <div className="flex flex-wrap gap-1.5">
                  {segments.map((s) => (
                    <button key={s.id} onClick={() => useSegment(s)} className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs hover:border-primary hover:bg-muted">
                      <Filter className="h-3.5 w-3.5 text-primary" /> {s.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Saved plans — prominent, one tap to reopen. */}
            {plans.length > 0 && (
              <div className="rounded-xl border p-3">
                <p className="mb-2 text-xs font-semibold text-muted-foreground">{t('dayPlanner.savedPlans')}</p>
                <div className="space-y-1">
                  {plans.slice(0, 6).map((p) => (
                    <div key={p.id} className="flex items-center justify-between rounded-lg border px-3 py-2 hover:bg-muted/40">
                      <button onClick={() => openSavedPlan(p)} className="flex min-w-0 flex-1 items-center gap-2 text-start">
                        <Navigation className="h-4 w-4 shrink-0 text-primary" />
                        <span className="truncate text-sm font-medium">{p.name}</span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">· {p.order.length} {t('dayPlanner.stops')}</span>
                      </button>
                      <button onClick={() => onDeletePlan(p.id)} className="ms-2 shrink-0 text-muted-foreground hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Secondary ways to start. */}
            <div>
              <div className="mb-2 flex items-center gap-2 text-[11px] text-muted-foreground"><span className="h-px flex-1 bg-border" />{t('dayPlanner.moreWays')}<span className="h-px flex-1 bg-border" /></div>
              <div className="flex flex-wrap justify-center gap-2">
                {hasSeed && <button onClick={() => useDataset(true)} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs hover:bg-muted"><LassoSelect className="h-4 w-4" /> {t('dayPlanner.srcDraw')}</button>}
                {hasSeed && <button onClick={() => fileRef.current?.click()} disabled={importing} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs hover:bg-muted disabled:opacity-60"><Upload className="h-4 w-4" /> {t('dayPlanner.srcUpload')}</button>}
              </div>
            </div>

            {msg && <p className="text-center text-sm text-amber-700">{msg}</p>}
          </div>
        </div>
      )}

      {/* STEP: column mapping + validation — shared ImportMapper (same wizard everywhere) */}
      {step === 'map' && (
        <div className="flex min-h-0 flex-1 flex-col p-2">
          <ImportMapper
            title={t('dayPlanner.mapStep')}
            fileName={fileName}
            rowCount={records.length}
            headers={headers}
            records={records}
            fields={DP_FIELDS.map((f) => ({ key: f.key, label: t(`dayPlanner.f_${f.key}`), required: f.required }))}
            mapping={mapping}
            onMap={(key, header) => setMapping((m) => ({ ...m, [key]: header }))}
            stats={[
              { label: t('dayPlanner.v_total'), value: validation.total },
              { label: t('dayPlanner.v_valid'), value: validation.valid, tone: 'ok' },
              { label: t('dayPlanner.v_missing'), value: validation.missingCoords, tone: 'warn' },
              { label: t('dayPlanner.v_invalid'), value: validation.invalidCoords, tone: 'warn' },
              { label: t('dayPlanner.v_dupes'), value: validation.duplicates, tone: 'warn' },
              { label: t('dayPlanner.v_skipped'), value: validation.skipped, tone: 'bad' },
            ]}
            requiredOk={requiredMapped}
            warning={t('dayPlanner.needRequired')}
            canContinue={requiredMapped && validation.valid > 0}
            continueLabel={t('dayPlanner.continue')}
            onBack={() => setStep('upload')}
            onContinue={continueFromMapping}
            badge={appliedTemplate ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">{t('dayPlanner.tplApplied').replace('{name}', appliedTemplate)}</span> : null}
            aside={<>
              <RejectedRowsBar count={validation.rejected.length} viewing={showRejected} onView={() => setShowRejected((s) => !s)} onDownload={downloadRejected} viewLabel={t('dayPlanner.viewRejected')} hideLabel={t('dayPlanner.hideRejected')} downloadLabel={t('dayPlanner.downloadRejected')} />
              {showRejected && <div className="max-h-40 overflow-y-auto rounded border text-[10px]">{validation.rejected.slice(0, 200).map((r) => <div key={r.row} className="flex items-center justify-between border-t px-2 py-0.5 first:border-t-0"><span className="truncate">{r.row}. {r.name}</span><span className="shrink-0 text-amber-700">{t(`dayPlanner.r${r.reason === 'missing_coords' ? 'Missing' : r.reason === 'invalid_coords' ? 'Invalid' : 'Duplicate'}`)}</span></div>)}</div>}
              <div className="mt-1 space-y-1.5 border-t pt-2">
                <p className="text-[11px] font-semibold text-muted-foreground">{t('dayPlanner.tplTitle')}</p>
                {templates.length > 0 && <select onChange={(e) => { const tp = templates.find((x) => x.id === e.target.value); if (tp) { setMapping(tp.mapping); setAppliedTemplate(tp.name); } }} value="" className="h-7 w-full rounded border bg-background px-1 text-[11px]"><option value="">{t('dayPlanner.tplApply')}</option>{templates.map((tp) => <option key={tp.id} value={tp.id}>{tp.name}</option>)}</select>}
                <div className="flex items-center gap-1.5"><Input value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder={t('dayPlanner.tplName')} className="h-7 flex-1 text-[11px]" /><button onClick={() => { if (tplName.trim()) { setTemplates(saveDpTemplate(tplName, headers, mapping)); setAppliedTemplate(tplName.trim()); setTplName(''); } }} disabled={!tplName.trim()} className="flex items-center gap-1 rounded border px-2 py-1 text-[11px] hover:bg-muted disabled:opacity-50"><Save className="h-3 w-3" /> {t('dayPlanner.tplSave')}</button></div>
              </div>
            </>}
          />
        </div>
      )}

      {/* STEP: plan */}
      {step === 'plan' && (
        <div className="grid min-h-0 flex-1 gap-2 overflow-hidden p-2 lg:grid-cols-[340px_1fr]">
          {/* Left control panel */}
          <Card className="flex min-h-0 flex-col self-stretch print:hidden"><CardContent className="flex min-h-0 flex-1 flex-col gap-2 p-2.5">
            {/* Live selected count */}
            <div className="flex items-center justify-between rounded-lg bg-primary/10 px-3 py-2">
              <span className="text-sm font-semibold text-primary">{selCount > 0 ? t('dayPlanner.selectedCount').replace('{n}', String(selCount)) : t('dayPlanner.allCount').replace('{n}', String(customers.length))}</span>
              {selCount > 0 && <button onClick={clearSelection} className="text-[11px] text-muted-foreground hover:text-red-600">{t('dayPlanner.clearSel')}</button>}
            </div>

            {!order && <>
              <p className="text-[11px] text-muted-foreground">{t('dayPlanner.pickHint')}</p>
              {/* Selection tools — Rectangle (primary) + Draw Area (freehand). Click to arm,
                  then drag on the map and release; customers inside are selected. */}
              <div className="flex flex-wrap items-center gap-1.5">
                <button onClick={() => { setSelectMode((m) => m === 'box' ? 'none' : 'box'); setPicking(null); }} className={`flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-medium hover:bg-muted ${selectMode === 'box' ? 'border-primary bg-primary text-primary-foreground' : 'border-primary/40 text-primary'}`}><Square className="h-3.5 w-3.5" /> {t('dayPlanner.selBox')}</button>
                <button onClick={() => { setSelectMode((m) => m === 'area' ? 'none' : 'area'); setPicking(null); }} className={`flex items-center gap-1 rounded border px-2 py-1 text-[11px] font-medium hover:bg-muted ${selectMode === 'area' ? 'border-primary bg-primary text-primary-foreground' : 'border-primary/40 text-primary'}`}><LassoSelect className="h-3.5 w-3.5" /> {t('dayPlanner.drawArea')}</button>
              </div>

              {/* Search */}
              <div className="relative"><Search className="pointer-events-none absolute start-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('dayPlanner.searchPlaceholder')} className="h-8 ps-7 text-xs" /></div>
              {search && (
                <div className="max-h-28 overflow-y-auto rounded border text-[11px]">
                  {filtered.slice(0, 50).map((c) => { const on = selectedIds.has(c.id); return (
                    <button key={c.id} onClick={() => { setSelectedIds((s) => { const n = new Set(s); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; }); setOrder(null); }} className={`flex w-full items-center justify-between border-t px-2 py-1 text-start first:border-t-0 hover:bg-muted ${on ? 'bg-primary/5' : ''}`}>
                      <span className="truncate">{c.name}</span>{on && <Check className="h-3 w-3 text-primary" />}
                    </button>); })}
                  {filtered.length === 0 && <p className="px-2 py-2 text-center text-muted-foreground">{t('dayPlanner.noMatch')}</p>}
                </div>
              )}

              {/* Quick filters — pick a segment (City / Salesman / Channel / Class) → selects it */}
              {hasFacets && (
                <div className="space-y-1">
                  <p className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground"><Filter className="h-3 w-3" /> {t('dayPlanner.quickFilters')}</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(['city', 'salesman', 'channel', 'class'] as const).map((key) => facets[key].length > 0 && (
                      <select key={key} value="" onChange={(e) => { if (e.target.value) selectByFacet(key, e.target.value); }} className="h-7 rounded border bg-background px-1 text-[11px]">
                        <option value="">{t(`dayPlanner.filter_${key}`)}</option>
                        {facets[key].map(([v, n]) => <option key={v} value={v}>{v} ({n})</option>)}
                      </select>
                    ))}
                  </div>
                </div>
              )}

              {/* Start / End presets */}
              {(['start', 'end'] as const).map((which) => {
                const isStart = which === 'start'; const kind = isStart ? startKind : endKind; const pt = isStart ? start : end;
                const opts = isStart ? (['current', 'warehouse', 'office', 'customer', 'map'] as StartKind[]) : (['last', 'warehouse', 'office', 'customer', 'map'] as EndKind[]);
                return (
                  <div key={which} className="rounded-md border p-2">
                    <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold">
                      <span className={`inline-block h-3 w-3 rounded-full ${isStart ? 'bg-green-600' : 'bg-red-600'}`} />{isStart ? t('dayPlanner.start') : t('dayPlanner.end')}
                      {(pt || (!isStart && kind === 'last')) && <span className="ms-auto inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600"><Check className="h-3 w-3" /> {t('dayPlanner.ready')}</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <select value={kind} onChange={(e) => isStart ? resolveStartKind(e.target.value as StartKind) : resolveEndKind(e.target.value as EndKind)} className="h-7 flex-1 rounded border bg-background px-1 text-[11px]">
                        {opts.map((o) => <option key={o} value={o}>{t(`dayPlanner.${isStart ? 'sk' : 'ek'}_${o}`)}</option>)}
                      </select>
                      {kind === 'customer' && <select value="" onChange={(e) => { if (e.target.value) useCustomerAs(which, e.target.value); }} className="h-7 max-w-[130px] rounded border bg-background px-1 text-[11px]"><option value="">{t('dayPlanner.useCustomer')}</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
                      {isStart && geoBusy && kind === 'current' && <span className="text-[10px] text-muted-foreground">{t('dayPlanner.locating')}</span>}
                    </div>
                  </div>
                );
              })}

              <Button className="mt-1" disabled={!canReview} onClick={review}><Wand2 className="h-4 w-4" /> {t('dayPlanner.review')}</Button>
              {msg && <p className="text-[11px] text-amber-700">{msg}</p>}

              {/* Selected customers — inspect / remove before generating. */}
              {selCount > 0 && (
                <div className="flex min-h-0 flex-1 flex-col">
                  <p className="mb-1 text-[11px] font-semibold text-muted-foreground">{t('dayPlanner.selList')} ({selCount})</p>
                  <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pe-1">
                    {[...selectedIds].map((id) => byId.get(id)).filter(Boolean).slice(0, 500).map((c) => (
                      <div key={c!.id} className="flex items-center gap-2 rounded border px-1.5 py-1 text-xs">
                        <span className="min-w-0 flex-1 truncate" title={c!.code ?? ''}>{c!.name}</span>
                        <button onClick={() => removeFromSelection(c!.id)} title={t('dayPlanner.remove')} className="shrink-0 text-muted-foreground hover:text-red-600"><X className="h-3 w-3" /></button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>}

            {/* Result: stats + ordered list */}
            {order && <>
              <div className="grid grid-cols-2 gap-1.5 text-center">
                {([['stTotal', String(order.length)], ['stDistance', formatDistanceKm(resultMetrics.distanceKm)], ['stTravel', formatDriveMinutes(resultMetrics.driveMinutes)], ['stVisit', formatDriveMinutes(visitMinutes)]] as const).map(([k, v]) => (
                  <div key={k} className="rounded-lg border bg-muted/30 p-2"><p className="text-sm font-bold tabular-nums" dir="ltr">{v}</p><p className="text-[10px] text-muted-foreground">{t(`dayPlanner.${k}`)}</p></div>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => { setOrder(null); setConfirming(false); }}><ChevronLeft className="h-4 w-4" /> {t('dayPlanner.editSelection')}</Button>
                <button onClick={regenerate} title={t('dayPlanner.regenerate')} className="rounded border px-2 py-1.5 hover:bg-muted"><RotateCcw className="h-4 w-4" /></button>
              </div>
              <div className="flex items-center gap-1.5"><Input value={planName} onChange={(e) => setPlanName(e.target.value)} placeholder={t('dayPlanner.planName')} className="h-7 flex-1 text-[11px]" /><button onClick={onSavePlan} disabled={!planName.trim()} className="flex items-center gap-1 rounded border px-2 py-1 text-[11px] hover:bg-muted disabled:opacity-50"><Save className="h-3 w-3" /> {t('dayPlanner.savePlan')}</button></div>
              {savedId && <p className="text-[10px] text-emerald-600">{t('dayPlanner.planSaved')}</p>}
              <p className="text-sm font-semibold">{t('dayPlanner.order')} ({orderedList.length})</p>
              <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pe-1">
                {orderedList.map((c, i) => (
                  <div key={c.id} className="flex items-center gap-2 rounded border px-1.5 py-1 text-xs">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate" title={c.code ?? ''}>{c.name}</span>
                    <span className="flex shrink-0 gap-0.5"><button onClick={() => move(i, -1)} className="rounded border p-0.5 hover:bg-muted"><ArrowUp className="h-3 w-3" /></button><button onClick={() => move(i, 1)} className="rounded border p-0.5 hover:bg-muted"><ArrowDown className="h-3 w-3" /></button></span>
                  </div>
                ))}
              </div>
            </>}
          </CardContent></Card>

          {/* Map */}
          <div className="relative min-h-0 print:hidden">
            <DayPlannerMap
              points={mapPoints} path={path} endpoints={endpoints} selectedIds={selectedIds}
              picking={picking != null} selectMode={selectMode}
              onBoxSelect={applySelection}
              onToggle={(id) => { setSelectedIds((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }); setOrder(null); }}
              onMapClick={onMapClick}
            />
            {picking && <div className="absolute inset-x-0 top-2 z-10 mx-auto w-fit rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground shadow">{'setLoc' in picking ? t('dayPlanner.setLocHint').replace('{name}', t(`dayPlanner.sk_${picking.setLoc}`)) : (picking.which === 'start' ? t('dayPlanner.clickStart') : t('dayPlanner.clickEnd'))}</div>}
            {!picking && selectMode === 'box' && <div className="absolute inset-x-0 top-2 z-10 mx-auto w-fit rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground shadow">{t('dayPlanner.drawHint')}</div>}
            {!picking && selectMode === 'area' && <div className="absolute inset-x-0 top-2 z-10 mx-auto w-fit rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground shadow">{t('dayPlanner.areaHint')}</div>}
          </div>
        </div>
      )}

      {/* Confirmation dialog */}
      {confirming && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/40 p-4 print:hidden">
          <Card className="w-full max-w-sm"><CardContent className="space-y-3 p-5">
            <p className="text-base font-bold">{t('dayPlanner.confirmTitle')}</p>
            <div className="space-y-1.5 text-sm">
              <div className="flex items-center justify-between"><span className="text-muted-foreground">{t('dayPlanner.stTotal')}</span><span className="font-semibold tabular-nums">{planned.length}</span></div>
              <div className="flex items-center justify-between"><span className="text-muted-foreground">{t('dayPlanner.start')}</span><span className="font-semibold">{t(`dayPlanner.sk_${startKind}`)}</span></div>
              <div className="flex items-center justify-between"><span className="text-muted-foreground">{t('dayPlanner.end')}</span><span className="font-semibold">{t(`dayPlanner.ek_${endKind}`)}</span></div>
              <div className="flex items-center justify-between"><span className="text-muted-foreground">{t('dayPlanner.stDistance')}</span><span className="font-semibold tabular-nums" dir="ltr">{formatDistanceKm(previewMetrics.distanceKm)}</span></div>
              <div className="flex items-center justify-between"><span className="text-muted-foreground">{t('dayPlanner.stTravel')}</span><span className="font-semibold tabular-nums" dir="ltr">{formatDriveMinutes(previewMetrics.driveMinutes)}</span></div>
            </div>
            <p className="text-xs text-muted-foreground">{t('dayPlanner.estNote')}</p>
            <div className="flex items-center gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setConfirming(false)}>{t('dayPlanner.back')}</Button>
              <Button className="flex-1" onClick={generate}><Check className="h-4 w-4" /> {t('dayPlanner.generatePlan')}</Button>
            </div>
          </CardContent></Card>
        </div>
      )}

      {/* Add / Replace prompt */}
      {pendingSel && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/40 p-4 print:hidden">
          <Card className="w-full max-w-xs"><CardContent className="space-y-3 p-5 text-center">
            <p className="text-sm font-semibold">{t('dayPlanner.addOrReplace').replace('{n}', String(pendingSel.length)).replace('{c}', String(selCount))}</p>
            <div className="flex items-center gap-2">
              <Button className="flex-1" onClick={() => resolvePending('add')}>{t('dayPlanner.addSel')}</Button>
              <Button variant="outline" className="flex-1" onClick={() => resolvePending('replace')}>{t('dayPlanner.replaceSel')}</Button>
            </div>
            <button onClick={() => setPendingSel(null)} className="text-[11px] text-muted-foreground hover:underline">{t('routePlanner.cancel')}</button>
          </CardContent></Card>
        </div>
      )}

      {/* Mobile view */}
      {mobileView && order && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-background print:hidden">
          <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
            <div><p className="text-base font-bold">{t('dayPlanner.title')}</p><p className="text-xs text-muted-foreground">{order.length} · {formatDistanceKm(resultMetrics.distanceKm)} · {formatDriveMinutes(resultMetrics.driveMinutes)}</p></div>
            <button onClick={() => setMobileView(false)} className="rounded-full border p-2"><X className="h-5 w-5" /></button>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {orderedList.map((c, i) => (
              <div key={c.id} className="flex items-center gap-3 rounded-xl border p-3 shadow-sm">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-base font-bold text-primary-foreground">{i + 1}</span>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{c.name}</p>{c.phone && <p className="truncate text-xs text-muted-foreground" dir="ltr">{c.phone}</p>}</div>
                <a href={stopNavUrl(c)} target="_blank" rel="noopener noreferrer" className="flex shrink-0 items-center gap-1 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"><Navigation className="h-4 w-4" /> {t('dayPlanner.navigate')}</a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Print route sheet (print-only) */}
      {order && (
        <div className="hidden print:block">
          <h1 className="mb-1 text-xl font-bold">{t('dayPlanner.title')}</h1>
          <p className="mb-3 text-sm">{t('dayPlanner.stTotal')}: {order.length} · {t('dayPlanner.stDistance')}: {formatDistanceKm(resultMetrics.distanceKm)} · {t('dayPlanner.stTravel')}: {formatDriveMinutes(resultMetrics.driveMinutes)} · {t('dayPlanner.stVisit')}: {formatDriveMinutes(visitMinutes)}</p>
          <table className="w-full border-collapse text-xs">
            <thead><tr className="border-b-2 border-black text-start">
              <th className="p-1 text-start">#</th><th className="p-1 text-start">{t('dayPlanner.f_code')}</th><th className="p-1 text-start">{t('dayPlanner.f_name')}</th><th className="p-1 text-start">{t('dayPlanner.f_phone')}</th><th className="p-1 text-start">{t('dayPlanner.f_address')}</th><th className="p-1 text-start">Map</th>
            </tr></thead>
            <tbody>{orderedList.map((c, i) => (
              <tr key={c.id} className="border-b border-gray-300"><td className="p-1">{i + 1}</td><td className="p-1">{c.code ?? ''}</td><td className="p-1">{c.name}</td><td className="p-1" dir="ltr">{c.phone ?? ''}</td><td className="p-1">{c.address ?? ''}</td><td className="p-1" dir="ltr">{stopNavUrl(c)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {/* Sticky mobile action bar — the two most-used actions within thumb reach.
          Only on small screens (desktop uses the header) and only after a plan exists. */}
      {step === 'plan' && order && !mobileView && (
        <div className="flex shrink-0 items-center gap-2 border-t bg-background p-2 lg:hidden print:hidden">
          <Button className="h-11 flex-1 text-sm" onClick={shareWhatsApp}><Share2 className="h-4 w-4" /> {t('dayPlanner.share')}</Button>
          <Button variant="outline" className="h-11 flex-1 text-sm" onClick={() => setMobileView(true)}><Smartphone className="h-4 w-4" /> {t('dayPlanner.mobileView')}</Button>
        </div>
      )}
    </div>
  );
}
