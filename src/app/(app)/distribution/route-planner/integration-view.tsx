'use client';

import { useEffect, useRef, useState } from 'react';
import { UploadCloud, Database, Activity, CheckCircle2, AlertTriangle, History, Plus, X, Cloud, Link2, Clock } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { Button } from '@/components/ui/button';
import { parseUploadColumns } from './import-actions';
import { ImportMapper } from './import-mapper';
import { runDataHealth, dataHealthTotal, type HCustomer, type DataHealthReport } from '@/lib/erp/route-planner-data-health';
import { RP_QUALITY_CHECKS } from '@/lib/erp/route-planner-backend';
import { runManualSync, listSyncRuns, listDataSources, createDataSource, saveFieldMapping, getFieldMapping } from './rp-backend-actions';

type Step = 'upload' | 'map' | 'report';
type Mapping = Record<string, string | undefined>;
type Source = Record<string, unknown>;

/** Customer Master fields that drive Data Health (the rest of the datasets come later). */
const CM_FIELDS = [
  { key: 'name', labelKey: 'dayPlanner.f_name', required: true },
  { key: 'lat', labelKey: 'dayPlanner.f_lat', required: true },
  { key: 'lng', labelKey: 'dayPlanner.f_lng', required: true },
  { key: 'code', labelKey: 'dayPlanner.f_code' },
  { key: 'salesman', labelKey: 'dayPlanner.f_salesman' },
  { key: 'route', labelKey: 'routePlanner.map_route' },
] as const;

const SOURCE_ICON: Record<string, typeof Database> = { manual_upload: UploadCloud, google_sheets: Cloud, api_erp: Link2, scheduled: Clock };

const str = (v: unknown) => { const s = (v ?? '').toString().trim(); return s || null; };
const num = (v: unknown) => { const n = Number((v ?? '').toString().trim()); return Number.isFinite(n) ? n : null; };

function toCustomers(records: Record<string, string>[], m: Mapping): HCustomer[] {
  return records.map((r) => ({
    code: m.code ? str(r[m.code]) : null,
    name: m.name ? str(r[m.name]) : null,
    lat: m.lat ? num(r[m.lat]) : null,
    lng: m.lng ? num(r[m.lng]) : null,
    salesman: m.salesman ? str(r[m.salesman]) : null,
    route: m.route ? str(r[m.route]) : null,
  }));
}

/**
 * Integration UI — Data Sources + Manual Upload connector + Field Mapping + Data Health +
 * Sync History. Pick (or create) a source → upload a customer file → map columns (shared
 * ImportMapper, persisted to erp_rp_field_mappings) → review the Data Health report (pure)
 * → record the sync to erp_rp_sync_runs. The Data Health report runs client-side, so it
 * works without a source; persistence (mapping save, sync history) needs a selected source.
 */
export function IntegrationView({ canManage = true }: { canManage?: boolean }) {
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [records, setRecords] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [report, setReport] = useState<DataHealthReport | null>(null);
  const [customers, setCustomers] = useState<HCustomer[]>([]);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [mapSaved, setMapSaved] = useState(false);
  const [saved, setSaved] = useState<{ imported: number; updated: number; rejected: number } | null>(null);
  const [runs, setRuns] = useState<Record<string, unknown>[]>([]);

  useEffect(() => { void refreshSources(); void refreshRuns(); }, []);
  async function refreshSources() { const r = await listDataSources(); if (r.ok) setSources((r.data as Source[]) ?? []); }
  async function refreshRuns() { const r = await listSyncRuns(20); if (r.ok) setRuns((r.data as Record<string, unknown>[]) ?? []); }

  const activeSource = sources.find((s) => String(s.id) === activeId) ?? null;

  async function selectSource(id: string) {
    setActiveId(id);
    // Preload any saved customer_master mapping for this source.
    const r = await getFieldMapping(id, 'customer_master');
    if (r.ok && r.data) setMapping(r.data as Mapping);
  }

  async function addSource() {
    const name = newName.trim(); if (!name) return;
    setMsg(null);
    const r = await createDataSource({ name, type: 'manual_upload' });
    if (!r.ok) { setMsg(r.error); return; }
    setNewName(''); setCreating(false);
    await refreshSources();
    setActiveId(r.data!.id);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setImporting(true); setMsg(null);
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await parseUploadColumns(fd);
      if (!res.ok) { setMsg(t('dayPlanner.uploadErr')); return; }
      setFileName(file.name); setHeaders(res.headers); setRecords(res.records);
      // Keep a preloaded saved mapping if its columns still exist; otherwise auto-detect.
      const sg = res.suggested as Record<string, string | undefined>;
      setMapping((prev) => {
        const keep = (v?: string) => (v && res.headers.includes(v) ? v : undefined);
        const hasPrev = Object.values(prev).some(Boolean);
        return hasPrev
          ? { name: keep(prev.name) ?? sg.name, lat: keep(prev.lat) ?? sg.lat, lng: keep(prev.lng) ?? sg.lng, code: keep(prev.code) ?? sg.code, salesman: keep(prev.salesman) ?? sg.salesman, route: keep(prev.route) ?? sg.route }
          : { name: sg.name, lat: sg.lat, lng: sg.lng, code: sg.code, salesman: sg.salesman, route: sg.route };
      });
      setStep('map');
    } catch { setMsg(t('dayPlanner.uploadErr')); }
    finally { setImporting(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  const requiredOk = !!(mapping.name && mapping.lat && mapping.lng);
  const validCount = requiredOk ? toCustomers(records, mapping).filter((c) => c.name && c.lat != null && c.lng != null).length : 0;

  async function continueToReport() {
    const cs = toCustomers(records, mapping);
    setCustomers(cs);
    setReport(runDataHealth({ customers: cs }));
    setStep('report'); setSaved(null); setMapSaved(false);
    // Persist the field mapping for the active source (only mapped, defined columns).
    if (activeId && canManage) {
      const clean: Record<string, string> = {};
      for (const k of Object.keys(mapping)) { const v = mapping[k]; if (v) clean[k] = v; }
      const r = await saveFieldMapping(activeId, 'customer_master', clean);
      if (r.ok) { setMapSaved(true); void refreshSources(); }
    }
  }

  async function recordSync() {
    setMsg(null);
    const valid = customers.filter((c) => c.name && c.lat != null && c.lng != null);
    const res = await runManualSync({
      sourceId: activeId, sourceLabel: fileName, master: { customers: valid }, existingCodes: [],
      rejected: customers.filter((c) => !(c.name && c.lat != null && c.lng != null)).map((_, i) => ({ row: i + 1, reason: 'missing_required' })),
    });
    if (!res.ok) { setMsg(res.error); return; }
    setSaved({ imported: res.data!.imported, updated: res.data!.updated, rejected: res.data!.rejected });
    void refreshRuns(); void refreshSources();
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3">
      <input ref={fileRef} type="file" accept=".csv,.xlsx,.json,.txt" className="hidden" onChange={onFile} />
      <div className="flex items-center gap-2">
        <Database className="h-5 w-5 text-primary" />
        <p className="text-sm font-bold">{t('rpShell.g_integrations')}</p>
      </div>

      <p className="flex items-start gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
        <Activity className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{t('rpShell.intg_purpose')}</span>
      </p>
      {!canManage && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{t('rpShell.intg_readOnly')}</p>
      )}

      {/* Data Sources strip */}
      <div className="rounded-lg border p-2">
        <div className="mb-1.5 flex items-center justify-between">
          <p className="text-xs font-semibold text-muted-foreground">{t('rpShell.intg_sources')}</p>
          {canManage && !creating && <Button size="sm" variant="outline" onClick={() => setCreating(true)}><Plus className="h-3.5 w-3.5" /> {t('rpShell.intg_newSource')}</Button>}
        </div>
        {creating && (
          <div className="mb-2 flex items-center gap-2">
            <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void addSource(); if (e.key === 'Escape') setCreating(false); }}
              placeholder={t('rpShell.intg_sourceName')} className="flex-1 rounded-md border px-2 py-1.5 text-sm" />
            <Button size="sm" onClick={addSource} disabled={!newName.trim()}>{t('rpShell.intg_create')}</Button>
            <Button size="sm" variant="ghost" onClick={() => { setCreating(false); setNewName(''); }}><X className="h-4 w-4" /></Button>
          </div>
        )}
        {sources.length === 0 && !creating ? (
          <p className="py-1 text-xs text-muted-foreground">{t('rpShell.intg_noSources')}</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {sources.map((s) => {
              const id = String(s.id); const Icon = SOURCE_ICON[String(s.type)] ?? Database; const on = id === activeId;
              return (
                <button key={id} onClick={() => selectSource(id)}
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${on ? 'border-primary bg-primary/10 font-medium text-primary' : 'hover:bg-muted'}`}>
                  <Icon className="h-3.5 w-3.5" />
                  <span className="max-w-[160px] truncate">{String(s.name)}</span>
                  {s.last_status ? <span className={`rounded-full px-1.5 text-[10px] ${String(s.last_status) === 'success' ? 'bg-emerald-100 text-emerald-700' : String(s.last_status) === 'failed' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{String(s.last_status)}</span> : null}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {step === 'upload' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <UploadCloud className="h-10 w-10 text-primary" />
          <p className="max-w-md text-sm text-muted-foreground">{t('rpShell.intg_intro')}</p>
          <p className="text-xs text-muted-foreground">{activeSource ? `${t('rpShell.intg_activeSource')}: ${String(activeSource.name)}` : t('rpShell.intg_adhoc')}</p>
          <Button onClick={() => fileRef.current?.click()} disabled={importing}><UploadCloud className="h-4 w-4" /> {importing ? t('routePlanner.importing') : t('rpShell.intg_upload')}</Button>
          {msg && <p className="text-sm text-amber-700">{msg}</p>}
          {runs.length > 0 && <SyncHistory runs={runs} t={t} />}
        </div>
      )}

      {step === 'map' && (
        <div className="flex min-h-0 flex-1 flex-col">
          <ImportMapper
            title={t('rpShell.intg_mapTitle')} fileName={fileName} rowCount={records.length}
            headers={headers} records={records}
            fields={CM_FIELDS.map((f) => ({ key: f.key, label: t(f.labelKey as Parameters<typeof t>[0]), required: 'required' in f ? f.required : false }))}
            mapping={mapping} onMap={(k, h) => setMapping((m) => ({ ...m, [k]: h }))}
            stats={[{ label: t('dayPlanner.v_total'), value: records.length }, { label: t('dayPlanner.v_valid'), value: validCount, tone: 'ok' }, { label: t('dayPlanner.v_skipped'), value: records.length - validCount, tone: 'warn' }]}
            requiredOk={requiredOk} warning={t('dayPlanner.needRequired')}
            canContinue={requiredOk && validCount > 0} continueLabel={t('rpShell.intg_runChecks')}
            onBack={() => setStep('upload')} onContinue={continueToReport}
          />
        </div>
      )}

      {step === 'report' && report && (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /><p className="text-sm font-semibold">{t('rpShell.intg_dataHealth')}</p><span className="text-xs text-muted-foreground">{fileName} · {customers.length} {t('dayPlanner.rows')}</span></div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setStep('map')}>{t('dayPlanner.back')}</Button>
              {canManage && <Button size="sm" onClick={recordSync}><History className="h-4 w-4" /> {t('rpShell.intg_record')}</Button>}
            </div>
          </div>
          {mapSaved && <p className="rounded bg-sky-50 px-3 py-1.5 text-xs text-sky-700">{t('rpShell.intg_mappingSaved')}</p>}
          {saved && <p className="rounded bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{t('rpShell.intg_recorded').replace('{i}', String(saved.imported)).replace('{u}', String(saved.updated)).replace('{r}', String(saved.rejected))}</p>}
          {msg && <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">{t('rpShell.intg_recordPending')} <span className="text-muted-foreground">({msg})</span></p>}

          <div className="rounded-lg border p-2">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold">{dataHealthTotal(report) === 0 ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}{t('rpShell.intg_issues').replace('{n}', String(dataHealthTotal(report)))}</div>
            <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {RP_QUALITY_CHECKS.map((k) => report[k] && (
                <div key={k} className={`flex items-center justify-between rounded border px-2 py-1.5 text-xs ${(report[k]!.count > 0) ? 'border-amber-200 bg-amber-50' : ''}`}>
                  <span>{t(`rpShell.dh_${k}` as Parameters<typeof t>[0])}</span>
                  <span className={`tabular-nums font-semibold ${report[k]!.count > 0 ? 'text-amber-700' : 'text-muted-foreground'}`} dir="ltr">{report[k]!.count}</span>
                </div>
              ))}
            </div>
          </div>

          {runs.length > 0 && <SyncHistory runs={runs} t={t} />}
        </div>
      )}
    </div>
  );
}

function SyncHistory({ runs, t }: { runs: Record<string, unknown>[]; t: ReturnType<typeof useI18n>['t'] }) {
  return (
    <div className="w-full rounded-lg border">
      <div className="flex items-center gap-1.5 border-b px-3 py-2 text-xs font-semibold"><History className="h-3.5 w-3.5" /> {t('rpShell.intg_history')}</div>
      <div className="max-h-56 overflow-y-auto text-[11px]">
        <table className="w-full">
          <thead className="sticky top-0 bg-muted"><tr>
            <th className="px-2 py-1 text-start font-semibold">{t('rpShell.intg_when')}</th><th className="px-2 py-1 text-start font-semibold">{t('rpShell.intg_source')}</th>
            <th className="px-2 py-1 text-end font-semibold">{t('rpShell.intg_imported')}</th><th className="px-2 py-1 text-end font-semibold">{t('rpShell.intg_updated')}</th>
            <th className="px-2 py-1 text-end font-semibold">{t('rpShell.intg_rejected')}</th><th className="px-2 py-1 text-start font-semibold">{t('dayPlanner.v_valid')}</th>
          </tr></thead>
          <tbody>{runs.map((r) => (
            <tr key={String(r.id)} className="border-t">
              <td className="whitespace-nowrap px-2 py-1 text-muted-foreground" dir="ltr">{new Date(String(r.started_at)).toLocaleString()}</td>
              <td className="truncate px-2 py-1">{String(r.source_label ?? '—')}</td>
              <td className="px-2 py-1 text-end tabular-nums" dir="ltr">{Number(r.rows_imported ?? 0)}</td>
              <td className="px-2 py-1 text-end tabular-nums" dir="ltr">{Number(r.rows_updated ?? 0)}</td>
              <td className="px-2 py-1 text-end tabular-nums text-amber-700" dir="ltr">{Number(r.rows_rejected ?? 0)}</td>
              <td className="px-2 py-1">{String(r.status ?? '')}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
