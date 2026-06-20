'use client';

import { useEffect, useRef, useState } from 'react';
import { UploadCloud, Database, Activity, CheckCircle2, AlertTriangle, History, Plus, X, Cloud, Link2, Clock, RefreshCw, Trash2, KeyRound } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { Button } from '@/components/ui/button';
import { parseUploadColumns } from './import-actions';
import { ImportMapper } from './import-mapper';
import { DatasetsPanel } from './datasets-panel';
import { runDataHealth, dataHealthTotal, type DataHealthReport } from '@/lib/erp/route-planner-data-health';
import { toCustomers, isValidCustomer, type CmMapping } from '@/lib/erp/route-planner-customer-map';
import { RP_QUALITY_CHECKS } from '@/lib/erp/route-planner-backend';
import { runManualSync, listSyncRuns, listDataSources, createDataSource, deleteDataSource, saveFieldMapping, getFieldMapping, fetchConnectorColumns, runConnectorSync } from './rp-backend-actions';

type Step = 'home' | 'map' | 'report';
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
type NewType = 'manual_upload' | 'google_sheets' | 'api_erp';

/**
 * Integration UI — Data Sources (Manual Upload + Google Sheets + Generic API) on ONE
 * pipeline: Fetch → Map (shared ImportMapper + toCustomers) → Validate / Data Health →
 * Sync History → Audit. The connector only fetches; everything after fetch is shared.
 * Connector config is admin-managed; API tokens are write-only and never shown back.
 */
export function IntegrationView({ canManage = true }: { canManage?: boolean }) {
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('home');
  // create-source form
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<NewType>('google_sheets');
  const [cfgUrl, setCfgUrl] = useState('');
  const [cfgToken, setCfgToken] = useState('');
  const [cfgPath, setCfgPath] = useState('');
  // map / report
  const [fileName, setFileName] = useState<string | null>(null);
  const [origin, setOrigin] = useState<'file' | 'connector'>('file');
  const [headers, setHeaders] = useState<string[]>([]);
  const [records, setRecords] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<CmMapping>({});
  const [report, setReport] = useState<DataHealthReport | null>(null);
  const [connQuality, setConnQuality] = useState<Record<string, number> | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ imported: number; updated: number; rejected: number } | null>(null);
  const [runs, setRuns] = useState<Record<string, unknown>[]>([]);
  const [confirmDel, setConfirmDel] = useState(false);

  async function removeSource() {
    if (!activeId) return;
    const r = await deleteDataSource(activeId);
    if (!r.ok) { setMsg(t('rpShell.intg_createErr')); return; }
    setConfirmDel(false); setActiveId(null); setStep('home');
    await refreshSources();
  }

  useEffect(() => { void refreshSources(); void refreshRuns(); }, []);
  async function refreshSources() { const r = await listDataSources(); if (r.ok) setSources((r.data as Source[]) ?? []); }
  async function refreshRuns() { const r = await listSyncRuns(20); if (r.ok) setRuns((r.data as Record<string, unknown>[]) ?? []); }

  const activeSource = sources.find((s) => String(s.id) === activeId) ?? null;
  const activeType = activeSource ? String(activeSource.type) : null;

  async function selectSource(id: string) {
    setActiveId(id); setStep('home'); setReport(null); setConnQuality(null); setSaved(null);
    const r = await getFieldMapping(id, 'customer_master');
    if (r.ok && r.data) setMapping(r.data as CmMapping);
  }

  async function addSource() {
    const name = newName.trim(); if (!name) return;
    setMsg(null);
    const config: Record<string, unknown> = newType === 'google_sheets' ? { sheetUrl: cfgUrl.trim() }
      : newType === 'api_erp' ? { endpoint: cfgUrl.trim(), token: cfgToken.trim() || undefined, rowsPath: cfgPath.trim() || undefined }
      : {};
    const r = await createDataSource({ name, type: newType, config });
    if (!r.ok) { setMsg(t('rpShell.intg_createErr')); return; }
    setCreating(false); setNewName(''); setCfgUrl(''); setCfgToken(''); setCfgPath('');
    await refreshSources();
    void selectSource(r.data!.id);
  }

  // ── Fetch step (differs per source) → both land on the shared map step ──
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setBusy(true); setMsg(null);
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await parseUploadColumns(fd);
      if (!res.ok) { setMsg(t('dayPlanner.uploadErr')); return; }
      setOrigin('file'); setFileName(file.name); setHeaders(res.headers); setRecords(res.records);
      applySuggested(res.suggested as Record<string, string | undefined>);
      setStep('map');
    } catch { setMsg(t('dayPlanner.uploadErr')); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  async function fetchFromConnector() {
    if (!activeId) return;
    setBusy(true); setMsg(null);
    const r = await fetchConnectorColumns(activeId);
    setBusy(false);
    if (!r.ok) { setMsg(connErr(r.error)); return; }
    setOrigin('connector'); setFileName(String(activeSource?.name ?? '')); setHeaders(r.data!.headers); setRecords(r.data!.records);
    applySuggested(r.data!.suggested);
    setStep('map');
  }
  function connErr(code: string) {
    if (code.startsWith('fetch_')) return t('rpShell.intg_fetchErr');
    return t('rpShell.intg_createErr');
  }
  function applySuggested(sg: Record<string, string | undefined>) {
    setMapping((prev) => {
      const keep = (v?: string) => (v && headersHas(v) ? v : undefined);
      const hasPrev = Object.values(prev).some(Boolean);
      return hasPrev
        ? { name: keep(prev.name) ?? sg.name, lat: keep(prev.lat) ?? sg.lat, lng: keep(prev.lng) ?? sg.lng, code: keep(prev.code) ?? sg.code, salesman: keep(prev.salesman) ?? sg.salesman, route: keep(prev.route) ?? sg.route }
        : { name: sg.name, lat: sg.lat, lng: sg.lng, code: sg.code, salesman: sg.salesman, route: sg.route };
    });
  }
  // headers may not be set yet inside applySuggested closure; compare against the just-fetched list
  function headersHas(v: string) { return headers.includes(v); }

  const requiredOk = !!(mapping.name && mapping.lat && mapping.lng);
  const validCount = requiredOk ? toCustomers(records, mapping).filter(isValidCustomer).length : 0;

  // ── Shared Map → Validate → Data Health → record (history/audit) ──
  async function continueFromMap() {
    if (origin === 'file') {
      const cs = toCustomers(records, mapping);
      setReport(runDataHealth({ customers: cs })); setConnQuality(null);
      setStep('report'); setSaved(null);
      if (activeId && canManage) {
        const clean: Record<string, string> = {}; for (const k of Object.keys(mapping)) { const v = mapping[k]; if (v) clean[k] = v; }
        await saveFieldMapping(activeId, 'customer_master', clean);
      }
    } else if (activeId) {
      // Connector: the server fetches the FULL dataset, runs the SAME pipeline, records the sync.
      setBusy(true); setMsg(null);
      const r = await runConnectorSync(activeId, mapping);
      setBusy(false);
      if (!r.ok) { setMsg(connErr(r.error)); return; }
      setReport(null); setConnQuality(r.data!.quality);
      setSaved({ imported: r.data!.imported, updated: r.data!.updated, rejected: r.data!.rejected });
      setStep('report'); void refreshRuns(); void refreshSources();
    }
  }

  async function recordFileSync() {
    if (!activeId && origin === 'file') { /* allow ad-hoc */ }
    setMsg(null);
    const cs = toCustomers(records, mapping);
    const valid = cs.filter(isValidCustomer);
    const cleanMap: Record<string, string> = {}; for (const k of Object.keys(mapping)) { const v = mapping[k]; if (v) cleanMap[k] = v; }
    const res = await runManualSync({
      sourceId: activeId, sourceLabel: fileName, master: { customers: valid }, existingCodes: [],
      rejected: cs.filter((c) => !isValidCustomer(c)).map((_, i) => ({ row: i + 1, reason: 'missing_required' })),
      // Wave B: persist the uploaded working set into the shared dataset model + make it active.
      datasetName: (fileName?.replace(/\.[^.]+$/, '') || t('rpShell.g_integrations')).slice(0, 80), columns: cleanMap,
    });
    if (!res.ok) { setMsg(res.error); return; }
    setSaved({ imported: res.data!.imported, updated: res.data!.updated, rejected: res.data!.rejected });
    void refreshRuns(); void refreshSources();
  }

  // Total issues for either source of the report.
  // Defensive: connQuality is a flat { check: number } map; coerce in case a nested value slips through.
  const num = (v: unknown): number => typeof v === 'number' ? v : (typeof v === 'object' && v ? Number((v as { count?: number }).count ?? 0) : 0);
  const qcount = (k: string): number => report ? (report[k as keyof DataHealthReport]?.count ?? 0) : num(connQuality?.[k]);
  const issues = report ? dataHealthTotal(report) : connQuality ? Object.keys(connQuality).reduce((a, k) => a + num(connQuality[k]), 0) : 0;

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
      {!canManage && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{t('rpShell.intg_readOnly')}</p>}

      {/* Data Sources strip */}
      <div className="rounded-lg border p-2">
        <div className="mb-1.5 flex items-center justify-between">
          <p className="text-xs font-semibold text-muted-foreground">{t('rpShell.intg_sources')}</p>
          {canManage && !creating && <Button size="sm" variant="outline" onClick={() => setCreating(true)}><Plus className="h-3.5 w-3.5" /> {t('rpShell.intg_newSource')}</Button>}
        </div>
        {creating && (
          <div className="mb-2 space-y-2 rounded-md border bg-muted/20 p-2">
            <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t('rpShell.intg_sourceName')} className="w-full rounded-md border px-2 py-1.5 text-sm" />
            <select value={newType} onChange={(e) => setNewType(e.target.value as NewType)} className="w-full rounded-md border px-2 py-1.5 text-sm">
              <option value="google_sheets">{t('rpShell.intg_t_google_sheets')}</option>
              <option value="api_erp">{t('rpShell.intg_t_api_erp')}</option>
              <option value="manual_upload">{t('rpShell.intg_t_manual_upload')}</option>
            </select>
            {newType === 'google_sheets' && (
              <input value={cfgUrl} onChange={(e) => setCfgUrl(e.target.value)} placeholder={t('rpShell.intg_sheetUrl')} dir="ltr" className="w-full rounded-md border px-2 py-1.5 text-sm" />
            )}
            {newType === 'api_erp' && (<>
              <input value={cfgUrl} onChange={(e) => setCfgUrl(e.target.value)} placeholder={t('rpShell.intg_endpoint')} dir="ltr" className="w-full rounded-md border px-2 py-1.5 text-sm" />
              <input value={cfgToken} onChange={(e) => setCfgToken(e.target.value)} placeholder={t('rpShell.intg_token')} type="password" autoComplete="off" dir="ltr" className="w-full rounded-md border px-2 py-1.5 text-sm" />
              <input value={cfgPath} onChange={(e) => setCfgPath(e.target.value)} placeholder={t('rpShell.intg_rowsPath')} dir="ltr" className="w-full rounded-md border px-2 py-1.5 text-sm" />
              <p className="text-[10px] text-muted-foreground">{t('rpShell.intg_tokenNote')}</p>
            </>)}
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setCreating(false)}><X className="h-4 w-4" /></Button>
              <Button size="sm" onClick={addSource} disabled={!newName.trim()}>{t('rpShell.intg_create')}</Button>
            </div>
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

        {/* Active source details + management (admin). Config is redacted server-side. */}
        {activeSource && canManage && (
          <div className="mt-2 rounded-md border bg-muted/20 p-2 text-[11px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-0.5">
                <p><span className="font-medium">{t('rpShell.intg_type')}:</span> {t(`rpShell.intg_t_${activeType}` as Parameters<typeof t>[0])}</p>
                {activeType === 'google_sheets' && <p className="truncate text-muted-foreground" dir="ltr">{String((activeSource.config as Record<string, unknown> | null)?.sheetUrl ?? '—')}</p>}
                {activeType === 'api_erp' && (<>
                  <p className="truncate text-muted-foreground" dir="ltr">{String((activeSource.config as Record<string, unknown> | null)?.endpoint ?? '—')}</p>
                  <p className="inline-flex items-center gap-1"><KeyRound className="h-3 w-3" /> {(activeSource.config as Record<string, unknown> | null)?.hasToken ? t('rpShell.intg_tokenSet') : t('rpShell.intg_tokenNone')}</p>
                </>)}
                {activeSource.last_sync_at ? <p className="text-muted-foreground">{t('rpShell.intg_lastSync')}: <span dir="ltr">{new Date(String(activeSource.last_sync_at)).toLocaleString()}</span></p> : null}
              </div>
              {confirmDel ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-red-700">{t('rpShell.intg_delConfirm')}</span>
                  <Button size="sm" variant="outline" className="text-red-600" onClick={removeSource}>{t('rpShell.intg_delYes')}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmDel(false)}>{t('dayPlanner.back')}</Button>
                </span>
              ) : (
                <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setConfirmDel(true)}><Trash2 className="h-3.5 w-3.5" /> {t('rpShell.intg_delete')}</Button>
              )}
            </div>
          </div>
        )}
      </div>

      {step === 'home' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <UploadCloud className="h-10 w-10 text-primary" />
          <p className="max-w-md text-sm text-muted-foreground">{t('rpShell.intg_intro')}</p>
          <p className="text-xs text-muted-foreground">{activeSource ? `${t('rpShell.intg_activeSource')}: ${String(activeSource.name)}` : t('rpShell.intg_adhoc')}</p>
          {/* Fetch action depends on the active source type. */}
          {activeType === 'google_sheets' || activeType === 'api_erp' ? (
            <Button onClick={fetchFromConnector} disabled={busy}><RefreshCw className="h-4 w-4" /> {busy ? t('routePlanner.importing') : t('rpShell.intg_fetchSync')}</Button>
          ) : (
            <Button onClick={() => fileRef.current?.click()} disabled={busy}><UploadCloud className="h-4 w-4" /> {busy ? t('routePlanner.importing') : t('rpShell.intg_upload')}</Button>
          )}
          {msg && <p className="text-sm text-amber-700">{msg}</p>}
          {/* Wave B: persisted customer working sets (own + reporting subtree). */}
          <div className="w-full max-w-2xl text-start"><DatasetsPanel canManage={canManage} /></div>
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
            canContinue={requiredOk && (origin === 'connector' || validCount > 0)} continueLabel={origin === 'connector' ? t('rpShell.intg_fetchSync') : t('rpShell.intg_runChecks')}
            onBack={() => setStep('home')} onContinue={continueFromMap}
          />
          {origin === 'connector' && <p className="px-1 pt-1 text-[10px] text-muted-foreground">{t('rpShell.intg_connectorMapNote')}</p>}
        </div>
      )}

      {step === 'report' && (report || connQuality) && (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /><p className="text-sm font-semibold">{t('rpShell.intg_dataHealth')}</p><span className="text-xs text-muted-foreground">{fileName}</span></div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setStep('home')}>{t('dayPlanner.back')}</Button>
              {origin === 'file' && canManage && <Button size="sm" onClick={recordFileSync}><History className="h-4 w-4" /> {t('rpShell.intg_record')}</Button>}
            </div>
          </div>
          {saved && <p className="rounded bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{t('rpShell.intg_recorded').replace('{i}', String(saved.imported)).replace('{u}', String(saved.updated)).replace('{r}', String(saved.rejected))}</p>}
          {msg && <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">{t('rpShell.intg_recordPending')} <span className="text-muted-foreground">({msg})</span></p>}

          <div className="rounded-lg border p-2">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold">{issues === 0 ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}{t('rpShell.intg_issues').replace('{n}', String(issues))}</div>
            <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {RP_QUALITY_CHECKS.map((k) => (
                <div key={k} className={`flex items-center justify-between rounded border px-2 py-1.5 text-xs ${qcount(k) > 0 ? 'border-amber-200 bg-amber-50' : ''}`}>
                  <span>{t(`rpShell.dh_${k}` as Parameters<typeof t>[0])}</span>
                  <span className={`tabular-nums font-semibold ${qcount(k) > 0 ? 'text-amber-700' : 'text-muted-foreground'}`} dir="ltr">{qcount(k)}</span>
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
