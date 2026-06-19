'use client';

import { useMemo, useRef, useState } from 'react';
import { Upload, Wand2, Check, MapPin, Plus, X, FileDown, RotateCcw } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { buildTisDatasetFromRows } from '@/lib/tis/upload';
import { isValidGeo, type TisDataset } from '@/lib/tis/dataset';
import { applyScenario, type Scenario } from '@/lib/tis/scenario';
import { moveCustomer } from '@/lib/tis/plan-edit';
import { simpleGeoSplit } from '@/lib/tis/optimize-routes';
import { routeStats, routeColors, routeIdsOf, unassignedCount, routeExportRows } from '@/lib/tis/route-planner';
import { buildXlsx } from '@/lib/erp/xlsx-write';
import { parseTisUpload } from '../studio/import-actions';
import { SelectionMap, type SelMapPoint } from './selection-map';

const NEW_ROUTE = '__new';
const UNASSIGNED = '__unassigned';

function emptyScenario(): Scenario { return { id: 'plan', name: 'Route plan', assignments: [] }; }

function downloadXlsx(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
  const [generated, setGenerated] = useState(false);
  const [routeCount, setRouteCount] = useState('8');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [targetRoute, setTargetRoute] = useState<string>(NEW_ROUTE);
  const [approved, setApproved] = useState(false);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<{ rows: Parameters<typeof buildTisDatasetFromRows>[0]; total: number; mapped: number } | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const applied = useMemo(() => (dataset ? applyScenario(dataset, scenario) : null), [dataset, scenario]);
  const colors = useMemo(() => (dataset ? routeColors(dataset, scenario) : new Map<string, string>()), [dataset, scenario]);
  const ids = useMemo(() => (dataset ? routeIdsOf(dataset, scenario) : []), [dataset, scenario]);
  const routeLabelOf = (rid: string | null) => (rid ? `${t('routePlanner.route')} ${ids.indexOf(rid) + 1}` : t('routePlanner.unassigned'));
  const stats = useMemo(() => (dataset ? routeStats(dataset, scenario) : []), [dataset, scenario]);
  const unassigned = useMemo(() => (dataset ? unassignedCount(dataset, scenario) : 0), [dataset, scenario]);

  const points = useMemo<SelMapPoint[]>(() => {
    if (!applied) return [];
    return applied.customers.filter((c) => isValidGeo(c.geo)).map((c) => ({
      id: c.id, name: c.name, lat: c.geo!.lat, lng: c.geo!.lng,
      color: c.ownership.routeId ? colors.get(c.ownership.routeId) ?? '#94a3b8' : '#cbd5e1',
    }));
  }, [applied, colors]);

  // ── Upload ──
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;
    setImporting(true); setMsg(null);
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await parseTisUpload(fd);
      if (!res.ok) { setMsg({ tone: 'err', text: t(`routePlanner.${res.error}`) }); return; }
      setPreview({ rows: res.rows, total: res.total, mapped: res.mapped });
    } catch {
      setMsg({ tone: 'err', text: t('routePlanner.err_parse') });
    } finally { setImporting(false); }
  }
  function confirmImport() {
    if (!preview) return;
    const ds = buildTisDatasetFromRows(preview.rows, { source: 'upload' });
    setDataset(ds);
    setScenario(emptyScenario());
    setGenerated(false); setApproved(false); setSelectedIds(new Set());
    setPreview(null);
    setMsg({ tone: 'ok', text: t('routePlanner.importOk').replace('{n}', String(ds.customers.length)) });
  }
  function reset() {
    setDataset(null); setScenario(emptyScenario()); setGenerated(false); setApproved(false);
    setSelectedIds(new Set()); setPreview(null); setMsg(null);
  }
  function onTemplate() {
    const header = 'code,name,lat,lng,route,frequency';
    const rows = ['C001,Sample Market,21.5810,39.1650,R-1,weekly', 'C002,Sample Grocery,24.7100,46.6700,R-2,2'];
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'route-planner-template.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ── Split / Correct / Approve / Export ──
  function generate() {
    if (!dataset) return;
    const k = Math.max(1, Math.round(Number(routeCount)) || 1);
    const plan = simpleGeoSplit(dataset.customers, k);
    const sc = plan.assignments.reduce((s, a) => moveCustomer(s, a.customerId, a.routeId ?? null), emptyScenario());
    setScenario(sc); setGenerated(true); setApproved(false); setSelectedIds(new Set());
    setTargetRoute(NEW_ROUTE);
  }
  function nextNewRouteId(): string {
    const present = new Set(ids);
    for (let n = 1; n <= present.size + 1; n++) { const id = `opt-route-${n}`; if (!present.has(id)) return id; }
    return `opt-route-${present.size + 1}`;
  }
  function moveSelected() {
    if (selectedIds.size === 0) return;
    const dest = targetRoute === NEW_ROUTE ? nextNewRouteId() : targetRoute === UNASSIGNED ? null : targetRoute;
    let sc = scenario;
    for (const id of selectedIds) sc = moveCustomer(sc, id, dest);
    setScenario(sc); setApproved(false); setSelectedIds(new Set());
  }
  function toggle(id: string) {
    setSelectedIds((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }
  function boxSelect(hits: string[]) {
    setSelectedIds((prev) => { const next = new Set(prev); for (const h of hits) next.add(h); return next; });
  }
  function exportRoutes() {
    if (!dataset || !approved) return;
    const rows = routeExportRows(dataset, scenario, routeLabelOf);
    downloadXlsx(buildXlsx(rows, 'Route Allocation'), 'route-allocation.xlsx');
  }

  // ── Upload screen ──
  if (!dataset) {
    return (
      <div className="space-y-4">
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.json,.txt" className="hidden" onChange={onFile} />
        {msg && <p className={`text-sm ${msg.tone === 'err' ? 'text-red-600' : 'text-emerald-600'}`}>{msg.text}</p>}
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="flex items-center gap-2 text-lg font-semibold"><Upload className="h-5 w-5" /> {t('routePlanner.uploadTitle')}</div>
            <p className="text-sm text-muted-foreground">{t('routePlanner.uploadLead')}</p>
            <ul className="list-inside list-disc text-sm text-muted-foreground">
              <li>{t('routePlanner.colCode')}</li><li>{t('routePlanner.colName')}</li>
              <li>{t('routePlanner.colGeo')}</li><li>{t('routePlanner.colRouteFreq')}</li>
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => fileRef.current?.click()} disabled={importing}><Upload className="h-4 w-4" /> {importing ? t('routePlanner.importing') : t('routePlanner.chooseFile')}</Button>
              <Button variant="outline" onClick={onTemplate}><FileDown className="h-4 w-4" /> {t('routePlanner.downloadTemplate')}</Button>
            </div>
            {preview && (
              <div className="rounded-md border bg-muted/30 p-4">
                <p className="text-sm">{t('routePlanner.previewSummary').replace('{n}', String(preview.rows.length)).replace('{total}', String(preview.total)).replace('{mapped}', String(preview.mapped))}</p>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" onClick={confirmImport}><Check className="h-4 w-4" /> {t('routePlanner.confirmImport')}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setPreview(null)}>{t('routePlanner.cancel')}</Button>
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground">{t('routePlanner.sessionNote')}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Planning screen ──
  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-x-4 gap-y-3 p-3">
          <div>
            <label className="block text-[11px] text-muted-foreground">{t('routePlanner.routeCount')}</label>
            <div className="flex items-center gap-2">
              <Input type="number" min={1} value={routeCount} onChange={(e) => setRouteCount(e.target.value)} className="h-9 w-24" dir="ltr" />
              <Button size="sm" onClick={generate}><Wand2 className="h-4 w-4" /> {generated ? t('routePlanner.regenerate') : t('routePlanner.generate')}</Button>
            </div>
          </div>
          <div className="flex-1" />
          {!approved ? (
            <Button size="sm" variant="default" disabled={!generated} onClick={() => setApproved(true)}><Check className="h-4 w-4" /> {t('routePlanner.approve')}</Button>
          ) : (
            <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600"><Check className="h-4 w-4" /> {t('routePlanner.approved')}</span>
          )}
          <Button size="sm" variant="outline" disabled={!approved} onClick={exportRoutes}><FileDown className="h-4 w-4" /> {t('routePlanner.exportRoutes')}</Button>
          <Button size="sm" variant="ghost" onClick={reset}><RotateCcw className="h-4 w-4" /> {t('routePlanner.newUpload')}</Button>
        </CardContent>
      </Card>

      {!generated && <p className="rounded-md border bg-blue-50 px-3 py-2 text-sm text-blue-900">{t('routePlanner.generateHint')}</p>}

      <div className="grid gap-3 lg:grid-cols-[1fr_300px]">
        {/* Map + selection controls */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <span className="font-medium">{t('routePlanner.selectedN').replace('{n}', String(selectedIds.size))}</span>
            <span className="text-muted-foreground">{t('routePlanner.moveTo')}</span>
            <select className="h-9 rounded-md border bg-background px-2 text-sm" value={targetRoute} onChange={(e) => setTargetRoute(e.target.value)}>
              <option value={NEW_ROUTE}>＋ {t('routePlanner.newRoute')}</option>
              {ids.map((id, i) => <option key={id} value={id}>{t('routePlanner.route')} {i + 1}</option>)}
              <option value={UNASSIGNED}>{t('routePlanner.unassigned')}</option>
            </select>
            <Button size="sm" disabled={selectedIds.size === 0} onClick={moveSelected}><MapPin className="h-4 w-4" /> {t('routePlanner.move')}</Button>
            {selectedIds.size > 0 && <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}><X className="h-4 w-4" /> {t('routePlanner.clear')}</Button>}
            <span className="ms-auto text-xs text-muted-foreground">{t('routePlanner.selectHint')}</span>
          </div>
          <SelectionMap points={points} selectedIds={selectedIds} onToggle={toggle} onBoxSelect={boxSelect} />
        </div>

        {/* Route side panel */}
        <Card className="self-start">
          <CardContent className="space-y-2 p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">{t('routePlanner.routesTitle')}</p>
              <span className="text-xs text-muted-foreground">{stats.length}</span>
            </div>
            <div className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
              <span /><span /><span className="text-end">{t('routePlanner.colCustomers')}</span><span className="text-end">{t('routePlanner.colVisits')}</span><span className="text-end">{t('routePlanner.colWorkload')}</span>
            </div>
            <div className="max-h-[52vh] space-y-1 overflow-y-auto pe-1">
              {stats.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">—</p>}
              {stats.map((s) => (
                <button
                  key={s.routeId}
                  onClick={() => setTargetRoute(s.routeId)}
                  className={`grid w-full grid-cols-[auto_1fr_auto_auto_auto] items-center gap-x-2 rounded border px-2 py-1.5 text-start text-xs hover:bg-muted ${targetRoute === s.routeId ? 'border-primary bg-primary/5' : ''}`}
                >
                  <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="truncate font-medium">{t('routePlanner.route')} {s.index}</span>
                  <span className="text-end tabular-nums" dir="ltr">{s.customers}</span>
                  <span className="text-end tabular-nums text-muted-foreground" dir="ltr">{s.weeklyVisits}</span>
                  <span className="text-end tabular-nums text-muted-foreground" dir="ltr">{s.workloadHours}h</span>
                </button>
              ))}
              {unassigned > 0 && (
                <div className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-x-2 rounded border border-dashed px-2 py-1.5 text-xs">
                  <span className="inline-block h-3 w-3 rounded-full bg-slate-300" />
                  <span className="truncate font-medium text-muted-foreground">{t('routePlanner.unassigned')}</span>
                  <span className="text-end tabular-nums" dir="ltr">{unassigned}</span>
                  <span /><span />
                </div>
              )}
            </div>
            {generated && (
              <Button size="sm" variant="outline" className="w-full" onClick={() => { setTargetRoute(NEW_ROUTE); }}>
                <Plus className="h-4 w-4" /> {t('routePlanner.moveToNew')}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
