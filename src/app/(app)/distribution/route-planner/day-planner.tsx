'use client';

import { useMemo, useRef, useState } from 'react';
import { X, Upload, Wand2, FileDown, MapPin, Share2, Printer, Map as MapIcon, ArrowUp, ArrowDown, RotateCcw, Trash2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { buildXlsxWorkbook } from '@/lib/erp/xlsx-write';
import { buildTisDatasetFromRows, applyColumnMapping, suggestColumnMapping } from '@/lib/tis/upload';
import { isValidGeo } from '@/lib/tis/dataset';
import { sequenceStops, type JourneyPoint } from '@/lib/tis/journey';
import { parseUploadColumns } from './import-actions';
import { DayPlannerMap, type DayMapPoint, type DayMapEndpoint } from './day-planner-map';

interface DPCustomer { id: string; code: string | null; name: string; lat: number; lng: number; sales?: number }

function downloadXlsx(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Day Planner — a standalone "build the best visit sequence for today" tool. No routes,
 * salesmen, frequencies or Journey Plan required: upload/select customers, set a Start and
 * End point (map click / existing customer / coordinates), generate a geographic order
 * (Start → nearest → … → End), then review on the map and export (Excel / Google Maps /
 * WhatsApp / Print). Reuses the shared nearest-neighbour sequencing engine.
 */
export function DayPlanner({ hasSalesDefault = false, onClose }: { hasSalesDefault?: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const [customers, setCustomers] = useState<DPCustomer[]>([]);
  const [hasSales, setHasSales] = useState(hasSalesDefault);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [start, setStart] = useState<JourneyPoint | null>(null);
  const [end, setEnd] = useState<JourneyPoint | null>(null);
  const [picking, setPicking] = useState<'start' | 'end' | null>(null);
  const [order, setOrder] = useState<string[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const byId = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);
  // The subset planned for today (selection, or everything when nothing is selected).
  const planned = useMemo(() => (selectedIds.size ? customers.filter((c) => selectedIds.has(c.id)) : customers), [customers, selectedIds]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setImporting(true); setMsg(null);
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await parseUploadColumns(fd);
      if (!res.ok) { setMsg(t('dayPlanner.uploadErr')); return; }
      const mapping = res.suggested;
      if (!mapping.name || !mapping.lat || !mapping.lng) { setMsg(t('dayPlanner.needCols')); return; }
      const rows = applyColumnMapping(res.records, mapping);
      const ds = buildTisDatasetFromRows(rows);
      const cs: DPCustomer[] = ds.customers.filter((c) => isValidGeo(c.geo)).map((c) => ({ id: c.id, code: c.code, name: c.name, lat: c.geo!.lat, lng: c.geo!.lng, sales: c.salesValue ?? undefined }));
      if (cs.length === 0) { setMsg(t('dayPlanner.noGeo')); return; }
      setCustomers(cs); setHasSales(cs.some((c) => (c.sales ?? 0) > 0)); setSelectedIds(new Set()); setOrder(null);
      setMsg(t('dayPlanner.loaded').replace('{n}', String(cs.length)));
    } catch { setMsg(t('dayPlanner.uploadErr')); }
    finally { setImporting(false); if (fileRef.current) fileRef.current.value = ''; }
    void suggestColumnMapping;
  }

  function onMapClick(lat: number, lng: number) {
    if (picking === 'start') setStart({ lat, lng, name: t('dayPlanner.mapPoint') });
    else if (picking === 'end') setEnd({ lat, lng, name: t('dayPlanner.mapPoint') });
    setPicking(null); setOrder(null);
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

  const orderedList = order ? order.map((id) => byId.get(id)).filter(Boolean) as DPCustomer[] : [];
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
    const header = ['Sequence', 'Customer Code', 'Customer Name', 'Latitude', 'Longitude'];
    if (hasSales) header.push('Sales');
    const rows: (string | number)[][] = [header];
    rows.push(['START', '', start?.name ?? 'Start', start?.lat ?? '', start?.lng ?? '']);
    orderedList.forEach((c, i) => { const r: (string | number)[] = [i + 1, c.code ?? '', c.name, c.lat, c.lng]; if (hasSales) r.push(c.sales ?? 0); rows.push(r); });
    rows.push(['END', '', end?.name ?? 'End', end?.lat ?? '', end?.lng ?? '']);
    downloadXlsx(buildXlsxWorkbook([{ name: 'Day Plan', rows }]), 'day-plan.xlsx');
  }
  function shareWhatsApp() {
    if (!order) return;
    const lines = orderedList.map((c, i) => `${i + 1}. ${c.name}`).join('\n');
    const text = `${t('dayPlanner.title')} (${orderedList.length})\n\n${lines}\n\n${t('dayPlanner.mapsLink')}: ${gmapsUrl()}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <input ref={fileRef} type="file" accept=".csv,.xlsx,.json,.txt" className="hidden" onChange={onFile} />
      {/* Header */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-2 print:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground"><MapIcon className="h-4 w-4" /></div>
          <p className="text-sm font-bold">{t('dayPlanner.title')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" disabled={!order} variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" /> {t('dayPlanner.print')}</Button>
          <Button size="sm" disabled={!order} variant="outline" onClick={exportExcel}><FileDown className="h-4 w-4" /> Excel</Button>
          <Button size="sm" disabled={!order} variant="outline" onClick={() => window.open(gmapsUrl(), '_blank', 'noopener')}><MapPin className="h-4 w-4" /> {t('dayPlanner.gmaps')}</Button>
          <Button size="sm" disabled={!order} variant="outline" onClick={shareWhatsApp}><Share2 className="h-4 w-4" /> WhatsApp</Button>
          <Button size="sm" variant="ghost" onClick={onClose}><X className="h-4 w-4" /> {t('routePlanner.cancel')}</Button>
        </div>
      </div>

      {customers.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <MapIcon className="h-10 w-10 text-primary" />
          <p className="max-w-md text-sm text-muted-foreground">{t('dayPlanner.intro')}</p>
          <Button onClick={() => fileRef.current?.click()} disabled={importing}><Upload className="h-4 w-4" /> {importing ? t('routePlanner.importing') : t('routePlanner.chooseFile')}</Button>
          {msg && <p className="text-sm text-amber-700">{msg}</p>}
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 gap-2 overflow-hidden p-2 lg:grid-cols-[320px_1fr]">
          {/* Left: start/end + ordered list */}
          <Card className="flex min-h-0 flex-col self-stretch print:border-0">
            <CardContent className="flex min-h-0 flex-1 flex-col gap-2 p-2.5">
              {/* Start / End */}
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
                      <button onClick={() => setPicking((p) => (p === which ? null : which))} className={`rounded border px-2 py-1 text-[11px] hover:bg-muted ${picking === which ? 'border-primary bg-primary/10' : ''}`}>{t('dayPlanner.pickMap')}</button>
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
                <button onClick={() => fileRef.current?.click()} title={t('routePlanner.newUpload')} className="rounded border px-2 py-1.5 hover:bg-muted"><RotateCcw className="h-4 w-4" /></button>
              </div>
              <p className="text-[11px] text-muted-foreground print:hidden">{selectedIds.size ? t('dayPlanner.usingSelected').replace('{n}', String(selectedIds.size)) : t('dayPlanner.usingAll').replace('{n}', String(customers.length))}</p>
              {msg && <p className="text-[11px] text-amber-700 print:hidden">{msg}</p>}

              {/* Ordered list (also the print + mobile view) */}
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
              picking={picking != null}
              onToggle={(id) => setSelectedIds((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; })}
              onMapClick={onMapClick}
            />
            {picking && <div className="absolute inset-x-0 top-2 z-10 mx-auto w-fit rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground shadow">{picking === 'start' ? t('dayPlanner.clickStart') : t('dayPlanner.clickEnd')}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
