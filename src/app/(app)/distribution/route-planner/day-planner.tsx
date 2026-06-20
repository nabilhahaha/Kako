'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Upload, Wand2, FileDown, MapPin, Share2, Printer, Map as MapIcon, ArrowUp, ArrowDown, RotateCcw, Trash2, Database, LassoSelect, Check, AlertTriangle, Save } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { buildXlsxWorkbook } from '@/lib/erp/xlsx-write';
import { sequenceStops, type JourneyPoint } from '@/lib/tis/journey';
import {
  DP_FIELDS, DP_REQUIRED_FIELDS, suggestDpMapping, validateDpImport,
  type DpFieldKey, type DpMapping, type DpCustomer,
} from '@/lib/tis/day-planner-import';
import { parseUploadColumns } from './import-actions';
import { DayPlannerMap, type DayMapPoint, type DayMapEndpoint } from './day-planner-map';
import { loadDpTemplates, saveDpTemplate, deleteDpTemplate, findBestTemplate, type DpTemplate } from './day-planner-templates';
import { saveDayPlannerDraft, loadDayPlannerDraft, clearDayPlannerDraft, type DayPlannerDraft, type DayPlannerStep } from './day-planner-draft';

function downloadXlsx(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Day Planner — a standalone "build the best visit sequence for today" tool. Three
 * customer sources feed ONE workflow (selection → validation → start → end →
 * generate): (1) upload an Excel/CSV with a flexible column-mapping + validation
 * step, (2) the customers already loaded in the Route Planner, or (3) draw an area
 * on the map. Set a Start and End, generate a nearest-neighbour order, review on the
 * map and export (Excel / Google Maps / WhatsApp / Print). Work autosaves and
 * survives Back / Refresh.
 */
export function DayPlanner({ hasSalesDefault = false, seedCustomers, onClose }: {
  hasSalesDefault?: boolean;
  seedCustomers?: DpCustomer[];
  onClose: () => void;
}) {
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<DayPlannerStep>('upload');
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [records, setRecords] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<DpMapping>({});
  const [appliedTemplate, setAppliedTemplate] = useState<string | null>(null);
  const [templates, setTemplates] = useState<DpTemplate[]>([]);
  const [tplName, setTplName] = useState('');
  const [showRejected, setShowRejected] = useState(false);

  const [customers, setCustomers] = useState<DpCustomer[]>([]);
  const [hasSales, setHasSales] = useState(hasSalesDefault);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [start, setStart] = useState<JourneyPoint | null>(null);
  const [end, setEnd] = useState<JourneyPoint | null>(null);
  const [picking, setPicking] = useState<'start' | 'end' | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [order, setOrder] = useState<string[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [pendingDraft, setPendingDraft] = useState<DayPlannerDraft | null>(null);
  const decided = useRef(false);

  useEffect(() => { setTemplates(loadDpTemplates()); }, []);

  // ── Draft recovery: offer to restore an autosaved session on mount. ──
  useEffect(() => {
    let on = true;
    (async () => {
      const d = await loadDayPlannerDraft();
      if (!on) return;
      if (d && (d.records.length > 0 || d.customers.length > 0)) setPendingDraft(d);
      else decided.current = true;
    })();
    return () => { on = false; };
  }, []);

  // ── Autosave (debounced) once the recovery choice is made. ──
  useEffect(() => {
    if (!decided.current) return;
    if (records.length === 0 && customers.length === 0) return;
    const id = setTimeout(() => {
      void saveDayPlannerDraft({
        v: 1, savedAt: Date.now(), step, fileName, headers, records, mapping,
        customers, hasSales, selectedIds: [...selectedIds], start, end, order,
      });
    }, 600);
    return () => clearTimeout(id);
  }, [step, fileName, headers, records, mapping, customers, hasSales, selectedIds, start, end, order]);

  // ── Warn before leaving with unsaved in-progress work. ──
  useEffect(() => {
    const dirty = records.length > 0 || customers.length > 0;
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [records.length, customers.length]);

  function restoreDraft() {
    const d = pendingDraft; if (!d) return;
    setStep(d.step); setFileName(d.fileName); setHeaders(d.headers); setRecords(d.records);
    setMapping(d.mapping); setCustomers(d.customers); setHasSales(d.hasSales);
    setSelectedIds(new Set(d.selectedIds)); setStart(d.start); setEnd(d.end); setOrder(d.order);
    decided.current = true; setPendingDraft(null);
  }
  function discardDraft() {
    void clearDayPlannerDraft(); decided.current = true; setPendingDraft(null);
  }

  const byId = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);
  const planned = useMemo(() => (selectedIds.size ? customers.filter((c) => selectedIds.has(c.id)) : customers), [customers, selectedIds]);
  const validation = useMemo(() => validateDpImport(records, mapping), [records, mapping]);
  const requiredMapped = DP_REQUIRED_FIELDS.every((k) => !!mapping[k]);

  // ── Source 1: upload + map. ──
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setImporting(true); setMsg(null);
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await parseUploadColumns(fd);
      if (!res.ok) { setMsg(t('dayPlanner.uploadErr')); return; }
      const tpl = findBestTemplate(res.headers);
      setFileName(file.name);
      setHeaders(res.headers);
      setRecords(res.records);
      setMapping(tpl ? tpl.mapping : suggestDpMapping(res.headers));
      setAppliedTemplate(tpl ? tpl.name : null);
      decided.current = true;
      setStep('map');
    } catch { setMsg(t('dayPlanner.uploadErr')); }
    finally { setImporting(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  function continueFromMapping() {
    if (!requiredMapped || validation.valid === 0) return;
    setCustomers(validation.customers);
    setHasSales(validation.customers.some((c) => (c.sales ?? 0) > 0));
    setSelectedIds(new Set()); setStart(null); setEnd(null); setOrder(null);
    setStep('plan');
  }

  // ── Sources 2 & 3: existing Route Planner customers (optionally start drawing). ──
  function useDataset(startDrawing: boolean) {
    if (!seedCustomers || seedCustomers.length === 0) return;
    decided.current = true;
    setCustomers(seedCustomers);
    setHasSales(seedCustomers.some((c) => (c.sales ?? 0) > 0) || hasSalesDefault);
    setSelectedIds(new Set()); setStart(null); setEnd(null); setOrder(null);
    setDrawing(startDrawing);
    setStep('plan');
  }

  function applyTemplate(id: string) {
    const tpl = templates.find((x) => x.id === id); if (!tpl) return;
    setMapping(tpl.mapping); setAppliedTemplate(tpl.name);
  }
  function onSaveTemplate() {
    const name = tplName.trim(); if (!name) return;
    setTemplates(saveDpTemplate(name, headers, mapping));
    setAppliedTemplate(name); setTplName('');
  }
  function onDeleteTemplate(id: string) { setTemplates(deleteDpTemplate(id)); }

  function downloadRejected() {
    if (validation.rejected.length === 0) return;
    const reasonLabel: Record<string, string> = {
      missing_coords: t('dayPlanner.rMissing'), invalid_coords: t('dayPlanner.rInvalid'), duplicate: t('dayPlanner.rDuplicate'),
    };
    const rows: (string | number)[][] = [['Row', 'Customer Code', 'Customer Name', 'Reason']];
    for (const r of validation.rejected) rows.push([r.row, r.code ?? '', r.name, reasonLabel[r.reason] ?? r.reason]);
    downloadXlsx(buildXlsxWorkbook([{ name: 'Rejected Rows', rows }]), 'day-plan-rejected.xlsx');
  }

  function onMapClick(lat: number, lng: number) {
    if (picking === 'start') setStart({ lat, lng, name: t('dayPlanner.mapPoint') });
    else if (picking === 'end') setEnd({ lat, lng, name: t('dayPlanner.mapPoint') });
    setPicking(null); setOrder(null);
  }
  function onBoxSelect(ids: string[], additive: boolean) {
    setSelectedIds((s) => {
      if (!additive) return new Set(ids);
      const n = new Set(s); ids.forEach((id) => n.add(id)); return n;
    });
    setOrder(null);
  }
  function useCustomerAs(which: 'start' | 'end', id: string) {
    const c = byId.get(id); if (!c) return;
    const pt = { lat: c.lat, lng: c.lng, name: c.name };
    if (which === 'start') setStart(pt); else setEnd(pt);
    setOrder(null);
  }

  function generate() {
    if (!start || !end || planned.length === 0) { setMsg(t('dayPlanner.needStartEnd')); return; }
    setOrder(sequenceStops(planned.map((c) => ({ id: c.id, lat: c.lat, lng: c.lng })), start, end));
    setMsg(null);
  }
  function move(idx: number, dir: -1 | 1) {
    if (!order) return;
    const j = idx + dir; if (j < 0 || j >= order.length) return;
    const next = [...order]; [next[idx], next[j]] = [next[j], next[idx]]; setOrder(next);
  }
  function resetAll() {
    void clearDayPlannerDraft();
    setStep('upload'); setFileName(null); setHeaders([]); setRecords([]); setMapping({});
    setCustomers([]); setSelectedIds(new Set()); setStart(null); setEnd(null); setOrder(null);
    setDrawing(false); setMsg(null);
  }

  const orderedList = order ? order.map((id) => byId.get(id)).filter(Boolean) as DpCustomer[] : [];
  const path: [number, number][] = useMemo(() => {
    if (!order || !start || !end) return [];
    return [[start.lng, start.lat], ...orderedList.map((c) => [c.lng, c.lat] as [number, number]), [end.lng, end.lat]];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, start, end, customers]);
  const mapPoints: DayMapPoint[] = useMemo(() => {
    const seqOf = new Map(order ? order.map((id, i) => [id, i + 1]) : []);
    return planned.map((c) => ({ id: c.id, name: c.name, lat: c.lat, lng: c.lng, seq: seqOf.get(c.id) }));
  }, [planned, order]);
  const endpoints: DayMapEndpoint[] = [
    ...(start ? [{ lat: start.lat, lng: start.lng, kind: 'start' as const }] : []),
    ...(end ? [{ lat: end.lat, lng: end.lng, kind: 'end' as const }] : []),
  ];

  // ── Outputs ──
  function gmapsUrl(): string {
    if (!order || !start || !end) return '';
    const stops = orderedList.slice(0, 23); // Google caps waypoints (~25 incl. origin+dest)
    const wp = stops.map((c) => `${c.lat},${c.lng}`).join('|');
    return `https://www.google.com/maps/dir/?api=1&origin=${start.lat},${start.lng}&destination=${end.lat},${end.lng}${wp ? `&waypoints=${encodeURIComponent(wp)}` : ''}&travelmode=driving`;
  }
  function exportExcel() {
    if (!order) return;
    const header = ['Sequence', 'Customer Code', 'Customer Name', 'Phone', 'City', 'Latitude', 'Longitude'];
    if (hasSales) header.push('Sales');
    const rows: (string | number)[][] = [header];
    rows.push(['START', '', start?.name ?? 'Start', '', '', start?.lat ?? '', start?.lng ?? '']);
    orderedList.forEach((c, i) => {
      const r: (string | number)[] = [i + 1, c.code ?? '', c.name, c.phone ?? '', c.city ?? '', c.lat, c.lng];
      if (hasSales) r.push(c.sales ?? 0);
      rows.push(r);
    });
    rows.push(['END', '', end?.name ?? 'End', '', '', end?.lat ?? '', end?.lng ?? '']);
    downloadXlsx(buildXlsxWorkbook([{ name: 'Day Plan', rows }]), 'day-plan.xlsx');
  }
  function shareWhatsApp() {
    if (!order) return;
    const lines = orderedList.map((c, i) => `${i + 1}. ${c.name}`).join('\n');
    const text = `${t('dayPlanner.title')} (${orderedList.length})\n\n${lines}\n\n${t('dayPlanner.mapsLink')}: ${gmapsUrl()}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  }

  const hasSeed = !!seedCustomers && seedCustomers.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <input ref={fileRef} type="file" accept=".csv,.xlsx,.json,.txt" className="hidden" onChange={onFile} />
      {/* Header */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-2 print:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground"><MapIcon className="h-4 w-4" /></div>
          <p className="text-sm font-bold">{t('dayPlanner.title')}</p>
          {step !== 'upload' && <button onClick={resetAll} className="ms-1 rounded border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted">{t('dayPlanner.startOver')}</button>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {step === 'plan' && <>
            <Button size="sm" disabled={!order} variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" /> {t('dayPlanner.print')}</Button>
            <Button size="sm" disabled={!order} variant="outline" onClick={exportExcel}><FileDown className="h-4 w-4" /> Excel</Button>
            <Button size="sm" disabled={!order} variant="outline" onClick={() => window.open(gmapsUrl(), '_blank', 'noopener')}><MapPin className="h-4 w-4" /> {t('dayPlanner.gmaps')}</Button>
            <Button size="sm" disabled={!order} variant="outline" onClick={shareWhatsApp}><Share2 className="h-4 w-4" /> WhatsApp</Button>
          </>}
          <Button size="sm" variant="ghost" onClick={onClose}><X className="h-4 w-4" /> {t('routePlanner.cancel')}</Button>
        </div>
      </div>

      {/* Draft recovery banner */}
      {pendingDraft && (
        <div className="flex flex-wrap items-center gap-2 border-b bg-amber-50 px-4 py-2 text-xs text-amber-900 print:hidden">
          <RotateCcw className="h-4 w-4" />
          <span>{t('dayPlanner.draftFound')}</span>
          <button onClick={restoreDraft} className="rounded bg-amber-600 px-2 py-1 font-medium text-white hover:bg-amber-700">{t('dayPlanner.restore')}</button>
          <button onClick={discardDraft} className="rounded border border-amber-300 px-2 py-1 hover:bg-amber-100">{t('dayPlanner.discard')}</button>
        </div>
      )}

      {/* STEP: source picker */}
      {step === 'upload' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
          <MapIcon className="h-10 w-10 text-primary" />
          <p className="max-w-md text-sm text-muted-foreground">{t('dayPlanner.intro')}</p>
          <div className="grid w-full max-w-3xl gap-3 sm:grid-cols-3">
            <button onClick={() => fileRef.current?.click()} disabled={importing} className="flex flex-col items-center gap-2 rounded-xl border p-5 text-center hover:border-primary hover:bg-muted/40 disabled:opacity-60">
              <Upload className="h-7 w-7 text-primary" />
              <span className="text-sm font-semibold">{importing ? t('routePlanner.importing') : t('dayPlanner.srcUpload')}</span>
              <span className="text-[11px] text-muted-foreground">{t('dayPlanner.srcUploadHint')}</span>
            </button>
            <button onClick={() => useDataset(false)} disabled={!hasSeed} className="flex flex-col items-center gap-2 rounded-xl border p-5 text-center hover:border-primary hover:bg-muted/40 disabled:opacity-50">
              <Database className="h-7 w-7 text-primary" />
              <span className="text-sm font-semibold">{t('dayPlanner.srcDataset')}</span>
              <span className="text-[11px] text-muted-foreground">{hasSeed ? t('dayPlanner.srcDatasetHint').replace('{n}', String(seedCustomers!.length)) : t('dayPlanner.srcDatasetEmpty')}</span>
            </button>
            <button onClick={() => useDataset(true)} disabled={!hasSeed} className="flex flex-col items-center gap-2 rounded-xl border p-5 text-center hover:border-primary hover:bg-muted/40 disabled:opacity-50">
              <LassoSelect className="h-7 w-7 text-primary" />
              <span className="text-sm font-semibold">{t('dayPlanner.srcDraw')}</span>
              <span className="text-[11px] text-muted-foreground">{hasSeed ? t('dayPlanner.srcDrawHint') : t('dayPlanner.srcDatasetEmpty')}</span>
            </button>
          </div>
          {msg && <p className="text-sm text-amber-700">{msg}</p>}
        </div>
      )}

      {/* STEP: column mapping + validation */}
      {step === 'map' && (
        <div className="grid min-h-0 flex-1 gap-2 overflow-hidden p-2 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* Left: preview + mapping */}
          <Card className="flex min-h-0 flex-col">
            <CardContent className="flex min-h-0 flex-1 flex-col gap-3 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-bold">{t('dayPlanner.mapStep')}</p>
                {fileName && <span className="truncate text-[11px] text-muted-foreground">{fileName} · {records.length} {t('dayPlanner.rows')}</span>}
                {appliedTemplate && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">{t('dayPlanner.tplApplied').replace('{name}', appliedTemplate)}</span>}
              </div>

              {/* Mapping grid */}
              <div className="grid gap-1.5 sm:grid-cols-2">
                {DP_FIELDS.map((f) => {
                  const sample = mapping[f.key] ? (records[0]?.[mapping[f.key]!] ?? '') : '';
                  return (
                    <label key={f.key} className="flex items-center gap-2 rounded border px-2 py-1 text-xs">
                      <span className="w-28 shrink-0 font-medium">
                        {t(`dayPlanner.f_${f.key}`)}{f.required && <span className="text-red-500"> *</span>}
                      </span>
                      <select
                        value={mapping[f.key] ?? ''}
                        onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value || undefined }))}
                        className={`h-7 min-w-0 flex-1 rounded border bg-background px-1 text-[11px] ${f.required && !mapping[f.key] ? 'border-red-300' : ''}`}
                      >
                        <option value="">{t('dayPlanner.notMapped')}</option>
                        {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                      {sample && <span className="hidden max-w-[80px] shrink-0 truncate text-[10px] text-muted-foreground sm:inline" dir="ltr" title={sample}>{sample}</span>}
                    </label>
                  );
                })}
              </div>

              {/* Preview table */}
              <div className="min-h-0 flex-1 overflow-auto rounded border">
                <table className="w-full text-[11px]">
                  <thead className="sticky top-0 bg-muted">
                    <tr>{headers.map((h) => <th key={h} className="whitespace-nowrap px-2 py-1 text-start font-semibold">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {records.slice(0, 8).map((rec, i) => (
                      <tr key={i} className="border-t">
                        {headers.map((h) => <td key={h} className="whitespace-nowrap px-2 py-1 text-muted-foreground" dir="ltr">{rec[h]}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Right: validation + templates + continue */}
          <Card className="flex min-h-0 flex-col">
            <CardContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
              <p className="text-sm font-bold">{t('dayPlanner.validation')}</p>
              {!requiredMapped && (
                <p className="flex items-center gap-1.5 rounded bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800"><AlertTriangle className="h-3.5 w-3.5" /> {t('dayPlanner.needRequired')}</p>
              )}
              <div className="space-y-1 text-xs">
                {([
                  ['total', validation.total, ''],
                  ['valid', validation.valid, 'text-emerald-600'],
                  ['missing', validation.missingCoords, 'text-amber-600'],
                  ['invalid', validation.invalidCoords, 'text-amber-600'],
                  ['dupes', validation.duplicates, 'text-amber-600'],
                  ['skipped', validation.skipped, 'text-red-600'],
                ] as const).map(([k, v, cls]) => (
                  <div key={k} className="flex items-center justify-between rounded border px-2 py-1">
                    <span>{t(`dayPlanner.v_${k}`)}</span>
                    <span className={`tabular-nums font-semibold ${cls}`} dir="ltr">{v}</span>
                  </div>
                ))}
              </div>
              {validation.rejected.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setShowRejected((s) => !s)} className="rounded border px-2 py-1 text-[11px] hover:bg-muted">{showRejected ? t('dayPlanner.hideRejected') : t('dayPlanner.viewRejected')}</button>
                  <button onClick={downloadRejected} className="flex items-center gap-1 rounded border px-2 py-1 text-[11px] hover:bg-muted"><FileDown className="h-3 w-3" /> {t('dayPlanner.downloadRejected')}</button>
                </div>
              )}
              {showRejected && (
                <div className="max-h-40 overflow-y-auto rounded border text-[10px]">
                  {validation.rejected.slice(0, 200).map((r) => (
                    <div key={r.row} className="flex items-center justify-between border-t px-2 py-0.5 first:border-t-0">
                      <span className="truncate">{r.row}. {r.name}</span>
                      <span className="shrink-0 text-amber-700">{t(`dayPlanner.r${r.reason === 'missing_coords' ? 'Missing' : r.reason === 'invalid_coords' ? 'Invalid' : 'Duplicate'}`)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Templates */}
              <div className="mt-1 space-y-1.5 border-t pt-2">
                <p className="text-[11px] font-semibold text-muted-foreground">{t('dayPlanner.tplTitle')}</p>
                {templates.length > 0 && (
                  <select onChange={(e) => { if (e.target.value) applyTemplate(e.target.value); }} value="" className="h-7 w-full rounded border bg-background px-1 text-[11px]">
                    <option value="">{t('dayPlanner.tplApply')}</option>
                    {templates.map((tp) => <option key={tp.id} value={tp.id}>{tp.name}</option>)}
                  </select>
                )}
                <div className="flex items-center gap-1.5">
                  <Input value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder={t('dayPlanner.tplName')} className="h-7 flex-1 text-[11px]" />
                  <button onClick={onSaveTemplate} disabled={!tplName.trim()} className="flex items-center gap-1 rounded border px-2 py-1 text-[11px] hover:bg-muted disabled:opacity-50"><Save className="h-3 w-3" /> {t('dayPlanner.tplSave')}</button>
                </div>
                {templates.map((tp) => (
                  <div key={tp.id} className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span className="truncate">{tp.name}</span>
                    <button onClick={() => onDeleteTemplate(tp.id)} className="rounded p-0.5 hover:bg-muted hover:text-red-600"><Trash2 className="h-3 w-3" /></button>
                  </div>
                ))}
              </div>

              <div className="mt-auto flex items-center gap-2 pt-2">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => setStep('upload')}>{t('dayPlanner.back')}</Button>
                <Button size="sm" className="flex-1" disabled={!requiredMapped || validation.valid === 0} onClick={continueFromMapping}><Check className="h-4 w-4" /> {t('dayPlanner.continue')}</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* STEP: plan (selection → start → end → generate) */}
      {step === 'plan' && (
        <div className="grid min-h-0 flex-1 gap-2 overflow-hidden p-2 lg:grid-cols-[320px_1fr]">
          {/* Left: start/end + ordered list */}
          <Card className="flex min-h-0 flex-col self-stretch print:border-0">
            <CardContent className="flex min-h-0 flex-1 flex-col gap-2 p-2.5">
              {(['start', 'end'] as const).map((which) => {
                const pt = which === 'start' ? start : end;
                return (
                  <div key={which} className="rounded-md border p-2 print:hidden">
                    <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold">
                      <span className={`inline-block h-3 w-3 rounded-full ${which === 'start' ? 'bg-green-600' : 'bg-red-600'}`} />
                      {which === 'start' ? t('dayPlanner.start') : t('dayPlanner.end')}
                      {pt && <span className="ms-auto font-mono text-[10px] font-normal text-muted-foreground" dir="ltr">{pt.lat.toFixed(4)}, {pt.lng.toFixed(4)}</span>}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button onClick={() => { setPicking((p) => (p === which ? null : which)); setDrawing(false); }} className={`rounded border px-2 py-1 text-[11px] hover:bg-muted ${picking === which ? 'border-primary bg-primary/10' : ''}`}>{t('dayPlanner.pickMap')}</button>
                      <select value="" onChange={(e) => { if (e.target.value) useCustomerAs(which, e.target.value); }} className="h-7 max-w-[120px] rounded border bg-background px-1 text-[11px]">
                        <option value="">{t('dayPlanner.useCustomer')}</option>
                        {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <Input placeholder="lat" dir="ltr" className="h-7 w-16 text-[11px]" defaultValue={pt?.lat ?? ''} onBlur={(e) => { const v = parseFloat(e.target.value); if (!Number.isNaN(v)) (which === 'start' ? setStart : setEnd)({ lat: v, lng: pt?.lng ?? 0, name: pt?.name }); }} />
                      <Input placeholder="lng" dir="ltr" className="h-7 w-16 text-[11px]" defaultValue={pt?.lng ?? ''} onBlur={(e) => { const v = parseFloat(e.target.value); if (!Number.isNaN(v)) (which === 'start' ? setStart : setEnd)({ lat: pt?.lat ?? 0, lng: v, name: pt?.name }); }} />
                    </div>
                  </div>
                );
              })}

              <div className="flex items-center gap-2 print:hidden">
                <Button size="sm" className="flex-1" onClick={generate}><Wand2 className="h-4 w-4" /> {order ? t('dayPlanner.regenerate') : t('dayPlanner.generate')}</Button>
                {order && <button onClick={() => setOrder(null)} title={t('dayPlanner.clearSeq')} className="rounded border px-2 py-1.5 hover:bg-muted"><Trash2 className="h-4 w-4" /></button>}
              </div>

              {/* Selection tools */}
              <div className="flex flex-wrap items-center gap-1.5 print:hidden">
                <button onClick={() => { setDrawing((d) => !d); setPicking(null); }} className={`flex items-center gap-1 rounded border px-2 py-1 text-[11px] hover:bg-muted ${drawing ? 'border-primary bg-primary/10' : ''}`}><LassoSelect className="h-3.5 w-3.5" /> {t('dayPlanner.drawSelect')}</button>
                {selectedIds.size > 0 && <button onClick={() => setSelectedIds(new Set())} className="rounded border px-2 py-1 text-[11px] hover:bg-muted">{t('dayPlanner.clearSel')}</button>}
              </div>
              <p className="text-[11px] text-muted-foreground print:hidden">{selectedIds.size ? t('dayPlanner.usingSelected').replace('{n}', String(selectedIds.size)) : t('dayPlanner.usingAll').replace('{n}', String(customers.length))}</p>
              {msg && <p className="text-[11px] text-amber-700 print:hidden">{msg}</p>}

              <p className="text-sm font-semibold">{t('dayPlanner.order')} {order ? `(${orderedList.length})` : ''}</p>
              <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pe-1">
                {!order && <p className="py-4 text-center text-xs text-muted-foreground">{t('dayPlanner.notGenerated')}</p>}
                {orderedList.map((c, i) => (
                  <div key={c.id} className="flex items-center gap-2 rounded border px-1.5 py-1 text-xs">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate" title={c.code ?? ''}>{c.name}</span>
                    {hasSales && <span className="shrink-0 tabular-nums text-muted-foreground" dir="ltr">{Math.round(c.sales ?? 0).toLocaleString()}</span>}
                    <span className="flex shrink-0 gap-0.5 print:hidden">
                      <button onClick={() => move(i, -1)} className="rounded border p-0.5 hover:bg-muted"><ArrowUp className="h-3 w-3" /></button>
                      <button onClick={() => move(i, 1)} className="rounded border p-0.5 hover:bg-muted"><ArrowDown className="h-3 w-3" /></button>
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Map */}
          <div className="relative min-h-0 print:hidden">
            <DayPlannerMap
              points={mapPoints} path={path} endpoints={endpoints} selectedIds={selectedIds}
              picking={picking != null} drawing={drawing} onBoxSelect={onBoxSelect}
              onToggle={(id) => { setSelectedIds((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }); setOrder(null); }}
              onMapClick={onMapClick}
            />
            {picking && <div className="absolute inset-x-0 top-2 z-10 mx-auto w-fit rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground shadow">{picking === 'start' ? t('dayPlanner.clickStart') : t('dayPlanner.clickEnd')}</div>}
            {drawing && !picking && <div className="absolute inset-x-0 top-2 z-10 mx-auto w-fit rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground shadow">{t('dayPlanner.drawHint')}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
