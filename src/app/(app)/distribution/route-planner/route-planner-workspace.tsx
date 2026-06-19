'use client';

import { useMemo, useRef, useState } from 'react';
import { Upload, Wand2, Check, MapPin, X, FileDown, RotateCcw, Square, PenTool, Layers } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { buildTisDatasetFromRows, applyColumnMapping, TIS_MAP_FIELDS, type TisFieldKey } from '@/lib/tis/upload';
import { isValidGeo, type TisDataset } from '@/lib/tis/dataset';
import { applyScenario, type Scenario } from '@/lib/tis/scenario';
import { moveCustomer } from '@/lib/tis/plan-edit';
import { simpleGeoSplit } from '@/lib/tis/optimize-routes';
import { routeReview, routeColors, routeIdsOf, unassignedCount, unassignedIds, routeExportRows, needsReviewExportRows, aggregateReview } from '@/lib/tis/route-planner';
import { formatFrequency } from '@/lib/route-optimization/visit-frequency';
import { buildXlsxWorkbook } from '@/lib/erp/xlsx-write';
import { parseUploadColumns } from './import-actions';
import { SelectionMap, type SelMapPoint, type SelMapHull } from './selection-map';

const NEW_ROUTE = '__new';
const UNASSIGNED = '__unassigned';

function emptyScenario(): Scenario { return { id: 'plan', name: 'Route plan', assignments: [] }; }

/** Reliable cross-browser file download: the anchor MUST be in the document for
 *  `.click()` to trigger a download in Firefox/Safari (and reliably in Chrome). */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener'; a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function downloadXlsx(bytes: Uint8Array, filename: string) {
  // Copy into a fresh ArrayBuffer so the Blob owns contiguous bytes (avoids any
  // shared-buffer/view edge cases across engines).
  const buf = bytes.slice().buffer;
  downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
}

/**
 * Simple Route Planner (MVP, P0–P3): Upload → Split → Correct on the map → Approve
 * → Export routes to Excel. Session-only; nothing is written to live data. Reuses the
 * TIS upload pipeline, the shared scenario/plan-edit engine and a single-pass geo
 * split — the manager does the final shaping by box/click-selecting on the map.
 */
export function RoutePlannerWorkspace() {
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);

  const [dataset, setDataset] = useState<TisDataset | null>(null);
  const [scenario, setScenario] = useState<Scenario>(emptyScenario());
  const [method, setMethod] = useState<'assisted' | 'manual' | null>(null);
  const [history, setHistory] = useState<Scenario[]>([]);
  const [generated, setGenerated] = useState(false);
  const [routeCount, setRouteCount] = useState('8');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [targetRoute, setTargetRoute] = useState<string>(NEW_ROUTE);
  const [focusedRoutes, setFocusedRoutes] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState<'box' | 'draw'>('box');
  const [showAllBoundaries, setShowAllBoundaries] = useState(false);
  const [showOnlySelected, setShowOnlySelected] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [approved, setApproved] = useState(false);
  const [importing, setImporting] = useState(false);
  const [mapState, setMapState] = useState<{ headers: string[]; records: Record<string, string>[]; map: Partial<Record<TisFieldKey, string>> } | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const applied = useMemo(() => (dataset ? applyScenario(dataset, scenario) : null), [dataset, scenario]);
  const colors = useMemo(() => (dataset ? routeColors(dataset, scenario) : new Map<string, string>()), [dataset, scenario]);
  const ids = useMemo(() => (dataset ? routeIdsOf(dataset, scenario) : []), [dataset, scenario]);
  const routeLabelOf = (rid: string | null) => (rid ? `${t('routePlanner.route')} ${ids.indexOf(rid) + 1}` : t('routePlanner.unassigned'));
  const reviews = useMemo(() => (dataset ? routeReview(dataset, scenario) : []), [dataset, scenario]);
  const unassigned = useMemo(() => (dataset ? unassignedCount(dataset, scenario) : 0), [dataset, scenario]);

  // Customer ids belonging to the focused routes (for fade + zoom-to-extent).
  const focusIds = useMemo(() => {
    if (!applied || focusedRoutes.size === 0) return new Set<string>();
    return new Set(applied.customers.filter((c) => c.ownership.routeId && focusedRoutes.has(c.ownership.routeId)).map((c) => c.id));
  }, [applied, focusedRoutes]);

  const points = useMemo<SelMapPoint[]>(() => {
    if (!applied) return [];
    const focusing = focusedRoutes.size > 0;
    const onlySel = showOnlySelected && focusing; // hide everything except the focused routes
    let cs = applied.customers.filter((c) => isValidGeo(c.geo));
    if (onlySel) cs = cs.filter((c) => c.ownership.routeId && focusedRoutes.has(c.ownership.routeId));
    return cs.map((c) => {
      const rid = c.ownership.routeId;
      return {
        id: c.id, name: c.name, lat: c.geo!.lat, lng: c.geo!.lng,
        color: rid ? colors.get(rid) ?? '#94a3b8' : '#f59e0b',
        review: !rid,
        dim: focusing && !onlySel && !(rid && focusedRoutes.has(rid)),
        meta: { code: c.code, route: rid, routeLabel: routeLabelOf(rid), routeColor: rid ? colors.get(rid) : undefined, frequency: c.frequency ? formatFrequency(c.frequency) : '' },
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied, colors, focusedRoutes, ids, showOnlySelected]);

  // Route boundaries: focused routes (always), or all when "show all boundaries" is on.
  const hulls = useMemo<SelMapHull[]>(() => {
    const show = focusedRoutes.size ? reviews.filter((r) => focusedRoutes.has(r.routeId)) : (showAllBoundaries ? reviews : []);
    return show.map((r) => ({ id: r.routeId, color: r.color, ring: r.hull }));
  }, [reviews, focusedRoutes, showAllBoundaries]);

  const summary = useMemo(() => aggregateReview(reviews, focusedRoutes), [reviews, focusedRoutes]);

  // Move preview: how many selected, and which routes they currently sit on.
  const movePreview = useMemo(() => {
    if (!applied || selectedIds.size === 0) return null;
    const from = new Set<string>();
    for (const c of applied.customers) if (selectedIds.has(c.id)) from.add(c.ownership.routeId ? routeLabelOf(c.ownership.routeId) : t('routePlanner.needsReview'));
    return { count: selectedIds.size, from: [...from] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied, selectedIds, ids]);

  // Destination options for both the popup and the toolbar: existing routes FIRST,
  // then Keep-unassigned, then "New route" LAST (creating a route is secondary).
  const routeOptions = useMemo(() => [
    ...ids.map((id, i) => ({ value: id, label: `${t('routePlanner.route')} ${i + 1}` })),
    { value: UNASSIGNED, label: t('routePlanner.keepUnassigned') },
    { value: NEW_ROUTE, label: `＋ ${t('routePlanner.newRoute')}` },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [ids]);
  // Guard a stale target (e.g. a route that was emptied out) → fall back to the first route.
  const effectiveTarget = (targetRoute === NEW_ROUTE || targetRoute === UNASSIGNED || ids.includes(targetRoute)) ? targetRoute : (ids[0] ?? NEW_ROUTE);

  // ── Upload → column mapping ──
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;
    setImporting(true); setMsg(null);
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await parseUploadColumns(fd);
      if (!res.ok) { setMsg({ tone: 'err', text: t(`routePlanner.${res.error}`) }); return; }
      setMapState({ headers: res.headers, records: res.records, map: res.suggested });
    } catch {
      setMsg({ tone: 'err', text: t('routePlanner.err_parse') });
    } finally { setImporting(false); }
  }
  function setFieldMap(field: TisFieldKey, header: string) {
    setMapState((m) => (m ? { ...m, map: { ...m.map, [field]: header || undefined } } : m));
  }
  function confirmMapping() {
    if (!mapState) return;
    const rows = applyColumnMapping(mapState.records, mapState.map);
    const ds = buildTisDatasetFromRows(rows, { source: 'upload' });
    setDataset(ds);
    setScenario(emptyScenario());
    setMethod(null); setHistory([]); setGenerated(false); setApproved(false); setSelectedIds(new Set()); setFocusedRoutes(new Set());
    setMapState(null);
    setMsg({ tone: 'ok', text: t('routePlanner.importOk').replace('{n}', String(ds.customers.length)) });
  }
  /** Pick a route-creation method. Manual starts from a blank map (everyone unassigned). */
  function chooseMethod(m: 'assisted' | 'manual') {
    if (!dataset) return;
    setMethod(m); setHistory([]); setApproved(false); setSelectedIds(new Set()); setFocusedRoutes(new Set());
    if (m === 'manual') {
      const blank = dataset.customers.reduce((s, c) => moveCustomer(s, c.id, null), emptyScenario());
      setScenario(blank); setGenerated(true); setSelectMode('draw'); setShowAllBoundaries(true);
      setTargetRoute(NEW_ROUTE); // draw → select, then Apply to "New route" creates a territory
    } else {
      setScenario(emptyScenario()); setGenerated(false); setSelectMode('box');
    }
  }
  function reset() {
    setDataset(null); setScenario(emptyScenario()); setMethod(null); setHistory([]); setGenerated(false); setApproved(false);
    setSelectedIds(new Set()); setFocusedRoutes(new Set()); setMapState(null); setMsg(null);
  }
  /** One-step-back history (drawing territories / moving). Keeps the last 30 states. */
  function pushHistory(prev: Scenario) { setHistory((h) => [...h.slice(-29), prev]); }
  function undo() { setHistory((h) => { if (h.length === 0) return h; setScenario(h[h.length - 1]); setApproved(false); setSelectedIds(new Set()); return h.slice(0, -1); }); }
  function onTemplate() {
    const header = 'code,name,lat,lng,route,frequency';
    const rows = ['C001,Sample Market,21.5810,39.1650,R-1,weekly', 'C002,Sample Grocery,24.7100,46.6700,R-2,2'];
    downloadBlob(new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8' }), 'route-planner-template.csv');
  }

  // ── Split / Correct / Approve / Export ──
  function generate() {
    if (!dataset) return;
    pushHistory(scenario);
    const k = Math.max(1, Math.round(Number(routeCount)) || 1);
    const plan = simpleGeoSplit(dataset.customers, k);
    const sc = plan.assignments.reduce((s, a) => moveCustomer(s, a.customerId, a.routeId ?? null), emptyScenario());
    setScenario(sc); setGenerated(true); setApproved(false); setSelectedIds(new Set()); setFocusedRoutes(new Set());
    // Default the move target to the first real route (Route → Route is the primary flow).
    setTargetRoute(plan.routes[0]?.routeId ?? NEW_ROUTE);
  }
  function nextNewRouteId(): string {
    const present = new Set(ids);
    for (let n = 1; n <= present.size + 1; n++) { const id = `opt-route-${n}`; if (!present.has(id)) return id; }
    return `opt-route-${present.size + 1}`;
  }
  /** Resolve a dropdown value (route id | New | Unassigned) to a concrete route id/null. */
  function resolveDest(value: string): string | null {
    return value === NEW_ROUTE ? nextNewRouteId() : value === UNASSIGNED ? null : value;
  }
  function moveSelectedTo(value: string) {
    if (selectedIds.size === 0) return;
    pushHistory(scenario);
    const dest = resolveDest(value);
    let sc = scenario;
    for (const id of selectedIds) sc = moveCustomer(sc, id, dest);
    setScenario(sc); setApproved(false); setSelectedIds(new Set()); setCtxMenu(null);
  }
  function moveSelected() { moveSelectedTo(effectiveTarget); }
  function moveSingle(id: string, value: string) {
    pushHistory(scenario);
    setScenario(moveCustomer(scenario, id, resolveDest(value))); setApproved(false);
    setSelectedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
  }
  function toggleFocus(routeId: string) {
    setFocusedRoutes((prev) => { const next = new Set(prev); next.has(routeId) ? next.delete(routeId) : next.add(routeId); return next; });
  }
  function focusAll() { setFocusedRoutes(new Set(ids)); }
  function clearFocus() { setFocusedRoutes(new Set()); setShowOnlySelected(false); }
  function toggle(id: string) {
    setSelectedIds((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }
  function boxSelect(hits: string[]) {
    setSelectedIds((prev) => { const next = new Set(prev); for (const h of hits) next.add(h); return next; });
  }
  function selectNeedsReview() {
    if (!dataset) return;
    setSelectedIds(new Set(unassignedIds(dataset, scenario)));
  }
  function exportRoutes() {
    if (!dataset || !approved) return;
    try {
      const sheets = [{ name: 'Route Allocation', rows: routeExportRows(dataset, scenario, routeLabelOf) }];
      if (unassigned > 0) sheets.push({ name: 'Needs Review', rows: needsReviewExportRows(dataset, scenario) });
      const assigned = sheets[0].rows.length - 1;
      downloadXlsx(buildXlsxWorkbook(sheets), 'route-allocation.xlsx');
      setMsg({ tone: 'ok', text: t('routePlanner.exportOk').replace('{n}', String(assigned)).replace('{r}', String(ids.length)) });
    } catch (e) {
      setMsg({ tone: 'err', text: `${t('routePlanner.exportErr')} ${e instanceof Error ? e.message : ''}`.trim() });
    }
  }

  // ── Upload screen (file picker, then flexible column mapping) ──
  if (!dataset) {
    const mp = mapState?.map;
    const requiredOk = !!(mp?.name && mp?.lat && mp?.lng);
    let ready = 0;
    if (mapState && mp?.name && mp.lat && mp.lng) {
      const toNum = (v: string | undefined) => Number(String(v ?? '').trim());
      for (const r of mapState.records) {
        const nm = (r[mp.name] ?? '').toString().trim();
        const la = toNum(r[mp.lat]); const lo = toNum(r[mp.lng]);
        if (nm && Number.isFinite(la) && Number.isFinite(lo) && !(la === 0 && lo === 0)) ready++;
      }
    }
    return (
      <div className="space-y-4">
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.json,.txt" className="hidden" onChange={onFile} />
        {msg && <p className={`text-sm ${msg.tone === 'err' ? 'text-red-600' : 'text-emerald-600'}`}>{msg.text}</p>}
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="flex items-center gap-2 text-lg font-semibold"><Upload className="h-5 w-5" /> {t('routePlanner.uploadTitle')}</div>

            {!mapState ? (
              <>
                <p className="text-sm text-muted-foreground">{t('routePlanner.uploadLead2')}</p>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => fileRef.current?.click()} disabled={importing}><Upload className="h-4 w-4" /> {importing ? t('routePlanner.importing') : t('routePlanner.chooseFile')}</Button>
                  <Button variant="outline" onClick={onTemplate}><FileDown className="h-4 w-4" /> {t('routePlanner.downloadTemplate')}</Button>
                </div>
                <p className="text-xs text-muted-foreground">{t('routePlanner.sessionNote')}</p>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">{t('routePlanner.mappingLead').replace('{n}', String(mapState.records.length))}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {TIS_MAP_FIELDS.map((f) => (
                    <div key={f.key} className="flex items-center gap-2">
                      <label className="w-32 shrink-0 text-sm">
                        {t(`routePlanner.map_${f.key}`)} {f.required && <span className="text-red-600">*</span>}
                      </label>
                      <select
                        className={`h-9 flex-1 rounded-md border bg-background px-2 text-sm ${f.required && !mp?.[f.key] ? 'border-red-400' : ''}`}
                        value={mp?.[f.key] ?? ''}
                        onChange={(e) => setFieldMap(f.key, e.target.value)}
                      >
                        <option value="">{t('routePlanner.map_none')}</option>
                        {mapState.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
                <p className={`text-sm ${requiredOk && ready > 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {requiredOk ? t('routePlanner.mapReady').replace('{ready}', String(ready)).replace('{total}', String(mapState.records.length)) : t('routePlanner.mapRequired')}
                </p>
                <div className="flex gap-2">
                  <Button size="sm" disabled={!requiredOk || ready === 0} onClick={confirmMapping}><Check className="h-4 w-4" /> {t('routePlanner.confirmImport')}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setMapState(null)}>{t('routePlanner.cancel')}</Button>
                </div>
                <p className="text-xs text-muted-foreground">{t('routePlanner.sessionNote')}</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Method chooser (after upload) ──
  if (method === null) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{t('routePlanner.importOk').replace('{n}', String(dataset.customers.length))} {t('routePlanner.chooseMethod')}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <button onClick={() => chooseMethod('assisted')} className="rounded-lg border bg-background p-5 text-start transition hover:border-primary hover:bg-primary/5">
            <div className="flex items-center gap-2 text-base font-semibold"><Wand2 className="h-5 w-5 text-primary" /> {t('routePlanner.methodAssisted')}</div>
            <p className="mt-2 text-sm text-muted-foreground">{t('routePlanner.methodAssistedDesc')}</p>
          </button>
          <button onClick={() => chooseMethod('manual')} className="rounded-lg border bg-background p-5 text-start transition hover:border-primary hover:bg-primary/5">
            <div className="flex items-center gap-2 text-base font-semibold"><PenTool className="h-5 w-5 text-primary" /> {t('routePlanner.methodManual')}</div>
            <p className="mt-2 text-sm text-muted-foreground">{t('routePlanner.methodManualDesc')}</p>
          </button>
        </div>
        <Button variant="ghost" size="sm" onClick={reset}><RotateCcw className="h-4 w-4" /> {t('routePlanner.newUpload')}</Button>
      </div>
    );
  }

  // ── Planning screen ──
  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-x-4 gap-y-3 p-3">
          {method === 'assisted' ? (
            <div>
              <label className="block text-[11px] text-muted-foreground">{t('routePlanner.routeCount')}</label>
              <div className="flex items-center gap-2">
                <Input type="number" min={1} value={routeCount} onChange={(e) => setRouteCount(e.target.value)} className="h-9 w-24" dir="ltr" />
                <Button size="sm" onClick={generate}><Wand2 className="h-4 w-4" /> {generated ? t('routePlanner.regenerate') : t('routePlanner.generate')}</Button>
              </div>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 text-sm font-medium"><PenTool className="h-4 w-4 text-primary" /> {t('routePlanner.methodManual')}</div>
          )}
          <button onClick={() => chooseMethod(method === 'assisted' ? 'manual' : 'assisted')} className="self-center rounded border px-2 py-1 text-[11px] hover:bg-muted">{method === 'assisted' ? t('routePlanner.switchManual') : t('routePlanner.switchAssisted')}</button>
          <div className="flex-1" />
          <Button size="sm" variant="ghost" disabled={history.length === 0} onClick={undo}><RotateCcw className="h-4 w-4" /> {t('routePlanner.undo')}</Button>
          {!approved ? (
            <Button size="sm" variant="default" disabled={reviews.length === 0} onClick={() => setApproved(true)}><Check className="h-4 w-4" /> {t('routePlanner.approve')}</Button>
          ) : (
            <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600"><Check className="h-4 w-4" /> {t('routePlanner.approved')}</span>
          )}
          <Button size="sm" variant="outline" disabled={!approved} onClick={exportRoutes}><FileDown className="h-4 w-4" /> {t('routePlanner.exportRoutes')}</Button>
          <Button size="sm" variant="ghost" onClick={reset}><RotateCcw className="h-4 w-4" /> {t('routePlanner.newUpload')}</Button>
        </CardContent>
      </Card>

      {msg && <p className={`rounded-md border px-3 py-2 text-sm ${msg.tone === 'err' ? 'border-red-300 bg-red-50 text-red-700' : 'border-emerald-300 bg-emerald-50 text-emerald-700'}`}>{msg.text}</p>}
      {method === 'assisted' && !generated && <p className="rounded-md border bg-blue-50 px-3 py-2 text-sm text-blue-900">{t('routePlanner.generateHint')}</p>}
      {method === 'manual' && <p className="rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-sm text-blue-900">{t('routePlanner.manualHint')}</p>}
      {generated && unassigned > 0 && method === 'assisted' && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">{t('routePlanner.reviewBanner').replace('{n}', String(unassigned))}</p>
      )}

      <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
        {/* Map + selection controls */}
        <div className="space-y-2">
          {/* Selection mode + boundaries + focus */}
          <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <span className="text-muted-foreground">{t('routePlanner.selectMode')}</span>
            <div className="inline-flex overflow-hidden rounded-md border">
              <button onClick={() => setSelectMode('box')} className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs ${selectMode === 'box' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`}><Square className="h-3.5 w-3.5" /> {t('routePlanner.boxSelect')}</button>
              <button onClick={() => setSelectMode('draw')} className={`inline-flex items-center gap-1 border-s px-2.5 py-1.5 text-xs ${selectMode === 'draw' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`}><PenTool className="h-3.5 w-3.5" /> {t('routePlanner.drawSelect')}</button>
            </div>
            <span className="text-xs text-muted-foreground">{selectMode === 'box' ? t('routePlanner.boxHint') : t('routePlanner.drawHint')}</span>
            <label className="ms-auto inline-flex cursor-pointer items-center gap-1 text-xs"><input type="checkbox" checked={showAllBoundaries} onChange={(e) => setShowAllBoundaries(e.target.checked)} /> <Layers className="h-3.5 w-3.5" /> {t('routePlanner.boundaries')}</label>
            {focusedRoutes.size > 0 && <Button size="sm" variant="ghost" onClick={clearFocus}><X className="h-4 w-4" /> {t('routePlanner.clearFocus')}</Button>}
          </div>

          {/* Move bar with preview */}
          <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <span className="font-medium">{t('routePlanner.selectedN').replace('{n}', String(selectedIds.size))}</span>
            {movePreview && movePreview.from.length > 0 && (
              <span className="text-xs text-muted-foreground">{t('routePlanner.fromRoutes').replace('{routes}', movePreview.from.slice(0, 3).join(', ') + (movePreview.from.length > 3 ? '…' : ''))}</span>
            )}
            <span className="text-muted-foreground">{t('routePlanner.moveTo')}</span>
            <select className="h-9 rounded-md border bg-background px-2 text-sm" value={effectiveTarget} onChange={(e) => setTargetRoute(e.target.value)}>
              {routeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <Button size="sm" disabled={selectedIds.size === 0} onClick={moveSelected}><MapPin className="h-4 w-4" /> {t('routePlanner.apply')}{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}</Button>
            {selectedIds.size > 0 && <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}><X className="h-4 w-4" /> {t('routePlanner.clear')}</Button>}
          </div>

          <SelectionMap points={points} hulls={hulls} selectedIds={selectedIds} focusIds={focusIds} routeOptions={routeOptions} selectMode={selectMode} onToggle={toggle} onBoxSelect={boxSelect} onMoveSingle={moveSingle} onContextMenu={(x, y) => setCtxMenu({ x, y })} />
        </div>

        {/* Route side panel */}
        <Card className="self-start">
          <CardContent className="space-y-2 p-3">
            {/* Summary for selected route(s) / all */}
            <div className="rounded-md border bg-muted/40 p-2">
              <p className="text-xs font-semibold">{focusedRoutes.size ? t('routePlanner.summaryFocused').replace('{n}', String(focusedRoutes.size)) : t('routePlanner.summaryAll')}</p>
              <div className="mt-1 grid grid-cols-3 gap-x-2 gap-y-1.5 text-xs">
                {([
                  [t('routePlanner.colCustomers'), String(summary.customers)],
                  [t('routePlanner.colVisits'), String(summary.weeklyVisits)],
                  [t('routePlanner.colWorkload'), `${summary.workloadHours}h`],
                  [t('routePlanner.colRadius'), `${summary.maxRadiusKm}km`],
                  [t('routePlanner.colCompactness'), String(summary.compactness)],
                  [t('routePlanner.colSelected'), String(selectedIds.size)],
                ] as [string, string][]).map(([label, value]) => (
                  <div key={label}><p className="text-[10px] text-muted-foreground">{label}</p><p className="font-semibold tabular-nums" dir="ltr">{value}</p></div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-1">
              <p className="text-sm font-semibold">{t('routePlanner.routesTitle')} <span className="text-xs font-normal text-muted-foreground">({reviews.length})</span></p>
              <div className="flex flex-wrap justify-end gap-1">
                <button onClick={focusAll} className="rounded border px-1.5 py-0.5 text-[11px] hover:bg-muted">{t('routePlanner.focusAll')}</button>
                <button onClick={clearFocus} className="rounded border px-1.5 py-0.5 text-[11px] hover:bg-muted">{t('routePlanner.clearFocus')}</button>
                <button disabled={focusedRoutes.size === 0} onClick={() => setShowOnlySelected((v) => !v)} className={`rounded border px-1.5 py-0.5 text-[11px] hover:bg-muted disabled:opacity-40 ${showOnlySelected ? 'border-primary bg-primary/10 text-primary' : ''}`}>{showOnlySelected ? t('routePlanner.showAll') : t('routePlanner.showOnly')}</button>
              </div>
            </div>
            <div className="grid grid-cols-[auto_auto_1fr_auto_auto_auto] items-center gap-x-2 text-[11px] text-muted-foreground">
              <span /><span /><span /><span className="text-end">{t('routePlanner.colCustomers')}</span><span className="text-end">{t('routePlanner.colVisits')}</span><span className="text-end">{t('routePlanner.colWorkload')}</span>
            </div>
            <div className="max-h-[44vh] space-y-1 overflow-y-auto pe-1">
              {reviews.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">—</p>}
              {reviews.map((s) => {
                const on = focusedRoutes.has(s.routeId);
                return (
                  <button
                    key={s.routeId}
                    onClick={() => toggleFocus(s.routeId)}
                    title={t('routePlanner.focusHint')}
                    className={`grid w-full grid-cols-[auto_auto_1fr_auto_auto_auto] items-center gap-x-2 rounded border px-2 py-1.5 text-start text-xs hover:bg-muted ${on ? 'border-primary bg-primary/5' : ''}`}
                  >
                    <span className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm border ${on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40'}`}>{on && <Check className="h-2.5 w-2.5" />}</span>
                    <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: s.color }} />
                    <span className="truncate font-medium">{t('routePlanner.route')} {s.index}</span>
                    <span className="text-end tabular-nums" dir="ltr">{s.customers}</span>
                    <span className="text-end tabular-nums text-muted-foreground" dir="ltr">{s.weeklyVisits}</span>
                    <span className="text-end tabular-nums text-muted-foreground" dir="ltr">{s.workloadHours}h</span>
                  </button>
                );
              })}
              {unassigned > 0 && (
                <button
                  onClick={selectNeedsReview}
                  title={t('routePlanner.selectReview')}
                  className="grid w-full grid-cols-[auto_auto_1fr_auto_auto_auto] items-center gap-x-2 rounded border border-dashed border-amber-400 bg-amber-50 px-2 py-1.5 text-start text-xs hover:bg-amber-100"
                >
                  <span />
                  <span className="inline-block h-3 w-3 rounded-full border-2 border-amber-800 bg-amber-500" />
                  <span className="truncate font-medium text-amber-900">{t('routePlanner.needsReview')}</span>
                  <span className="text-end tabular-nums text-amber-900" dir="ltr">{unassigned}</span>
                  <span /><span />
                </button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right-click context menu — a shortcut for the toolbar Move (acts on the selection). */}
      {ctxMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setCtxMenu(null)} onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null); }} />
          <div className="fixed z-50 w-56 rounded-md border bg-popover p-1 text-sm shadow-md" style={{ left: Math.min(ctxMenu.x, (typeof window !== 'undefined' ? window.innerWidth : 9999) - 240), top: ctxMenu.y }}>
            <p className="px-2 py-1 text-xs text-muted-foreground">{t('routePlanner.selectedN').replace('{n}', String(selectedIds.size))}</p>
            {selectedIds.size === 0 ? (
              <p className="px-2 py-1 text-xs text-muted-foreground">{t('routePlanner.ctxNoSel')}</p>
            ) : (
              <>
                <p className="px-2 pt-1 text-[11px] font-medium text-muted-foreground">{t('routePlanner.moveTo')}</p>
                <div className="max-h-52 overflow-y-auto">
                  {routeOptions.map((o) => (
                    <button key={o.value} onClick={() => moveSelectedTo(o.value)} className="block w-full rounded px-2 py-1 text-start hover:bg-muted">{o.label}</button>
                  ))}
                </div>
              </>
            )}
            <div className="my-1 border-t" />
            <button onClick={() => { setSelectedIds(new Set()); setCtxMenu(null); }} className="block w-full rounded px-2 py-1 text-start hover:bg-muted">{t('routePlanner.clearSelection')}</button>
          </div>
        </>
      )}
    </div>
  );
}
