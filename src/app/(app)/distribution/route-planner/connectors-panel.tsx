'use client';

import { useEffect, useState } from 'react';
import { Plug, CheckCircle2, PauseCircle, AlertTriangle, RefreshCw, Clock, Plus, Play } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { getConnectors, type DataSourceRow, type SyncRunRow } from './rp-connectors-read-actions';
import { getMyConnectorPerms, createConnector, updateConnector, runSync } from './rp-connector-write-actions';

/**
 * Phase C4 (read) + D3 (no-secret admin). Lists data sources + recent syncs. Admins/managers
 * can create non-secret sources (manual upload / public-CSV sheets), pause/resume, edit
 * schedule, and run-sync public sheets. The UI never accepts or shows a token/secret.
 */
function SourceStatus({ status }: { status: string }) {
  const { t } = useI18n();
  const map: Record<string, { icon: typeof CheckCircle2; cls: string }> = {
    active: { icon: CheckCircle2, cls: 'text-emerald-600' },
    paused: { icon: PauseCircle, cls: 'text-amber-600' },
    error: { icon: AlertTriangle, cls: 'text-red-600' },
  };
  const { icon: Icon, cls } = map[status] ?? map.active;
  return <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${cls}`}><Icon className="h-3.5 w-3.5" />{t(`rpConn.src_${status}` as 'rpConn.src_active')}</span>;
}

export function ConnectorsPanel() {
  const { t, locale } = useI18n();
  const [sources, setSources] = useState<DataSourceRow[]>([]);
  const [recent, setRecent] = useState<SyncRunRow[]>([]);
  const [healthy, setHealthy] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<{ name: string; type: 'manual_upload' | 'google_sheets'; sheetUrl: string; schedule: string }>({ name: '', type: 'manual_upload', sheetUrl: '', schedule: '' });

  async function refresh() {
    const res = await getConnectors();
    if (res.ok) { setSources(res.data.sources); setRecent(res.data.recentSyncs); setHealthy(res.data.healthy); }
    setLoaded(true);
  }
  useEffect(() => {
    void (async () => {
      await refresh();
      const p = await getMyConnectorPerms();
      if (p.ok) setCanManage(p.data.canManage);
    })();
  }, []);

  const dt = (s: string | null) => (s ? new Date(s).toLocaleString(locale === 'ar' ? 'ar' : 'en', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

  async function onCreate() {
    if (!form.name.trim()) return;
    setBusy(true); setMsg(null);
    const res = await createConnector({ name: form.name, type: form.type, sheetUrl: form.type === 'google_sheets' ? form.sheetUrl : null, schedule: form.schedule || null });
    setBusy(false);
    if (res.ok) { setForm({ name: '', type: 'manual_upload', sheetUrl: '', schedule: '' }); setShowForm(false); setMsg({ tone: 'ok', text: t('rpConn.created') }); await refresh(); }
    else setMsg({ tone: 'err', text: t('rpConn.err') + ' ' + res.error });
  }
  async function onToggle(s: DataSourceRow) {
    setBusy(true); setMsg(null);
    const res = await updateConnector(s.id, { status: s.status === 'paused' ? 'active' : 'paused' });
    setBusy(false);
    if (res.ok) { setMsg({ tone: 'ok', text: t('rpConn.updated') }); await refresh(); }
    else setMsg({ tone: 'err', text: t('rpConn.err') + ' ' + res.error });
  }
  async function onSync(s: DataSourceRow) {
    setBusy(true); setMsg(null);
    const res = await runSync(s.id);
    setBusy(false);
    if (res.ok) { setMsg({ tone: 'ok', text: t('rpConn.syncedRows', { n: res.data.rows }) }); await refresh(); }
    else setMsg({ tone: 'err', text: t('rpConn.err') + ' ' + res.error });
  }

  if (!loaded) return <p className="px-3 py-6 text-center text-xs text-muted-foreground">{t('rpConn.loading')}</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Plug className="h-4 w-4 text-primary" />
        <p className="text-sm font-bold">{t('rpConn.title')}</p>
        <span className="text-[11px] text-muted-foreground">{t('rpConn.healthyOf', { h: healthy, n: sources.length })}</span>
        <div className="flex-1" />
        {canManage && (
          <button onClick={() => setShowForm((v) => !v)} disabled={busy} className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
            <Plus className="h-3.5 w-3.5" /> {t('rpConn.newSource')}
          </button>
        )}
      </div>

      {msg && <p className={`rounded-md border px-3 py-1.5 text-xs ${msg.tone === 'err' ? 'border-red-300 bg-red-50 text-red-700' : 'border-emerald-300 bg-emerald-50 text-emerald-700'}`}>{msg.text}</p>}

      {showForm && canManage && (
        <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-0.5 text-[11px] text-muted-foreground">{t('rpConn.fName')}
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded border px-2 py-1 text-xs text-foreground" /></label>
            <label className="flex flex-col gap-0.5 text-[11px] text-muted-foreground">{t('rpConn.fType')}
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as 'manual_upload' | 'google_sheets' })} className="rounded border px-2 py-1 text-xs text-foreground">
                <option value="manual_upload">{t('rpConn.type_manual_upload')}</option>
                <option value="google_sheets">{t('rpConn.type_google_sheets')}</option>
              </select></label>
            <label className="flex flex-col gap-0.5 text-[11px] text-muted-foreground">{t('rpConn.fSchedule')}
              <input value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value })} className="rounded border px-2 py-1 text-xs text-foreground" placeholder={t('rpConn.fSchedulePh')} /></label>
          </div>
          {form.type === 'google_sheets' && (
            <label className="flex flex-col gap-0.5 text-[11px] text-muted-foreground">{t('rpConn.fSheetUrl')}
              <input value={form.sheetUrl} onChange={(e) => setForm({ ...form, sheetUrl: e.target.value })} className="w-full rounded border px-2 py-1 text-xs text-foreground" placeholder="https://docs.google.com/spreadsheets/d/…" /></label>
          )}
          <div className="flex items-center gap-2">
            <button onClick={() => void onCreate()} disabled={busy || !form.name.trim()} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50">{t('rpConn.create')}</button>
            <button onClick={() => setShowForm(false)} disabled={busy} className="rounded-md border px-3 py-1.5 text-xs">{t('rpConn.cancel')}</button>
            <span className="text-[10px] text-muted-foreground">{t('rpConn.noSecretNote')}</span>
          </div>
        </div>
      )}

      {sources.length === 0 ? (
        <p className="rounded-lg border px-3 py-6 text-center text-xs text-muted-foreground">{t('rpConn.empty')}</p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {sources.map((s) => (
            <div key={s.id} className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-semibold" title={s.name}>{s.name}</span>
                <SourceStatus status={s.status} />
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{t(`rpConn.type_${s.type}` as 'rpConn.type_manual_upload')}</p>
              <div className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
                <p className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{t('rpConn.lastSync')}: {dt(s.lastSyncAt)}{s.lastStatus ? ` · ${s.lastStatus}` : ''}</p>
                <p>{t('rpConn.mappings', { n: s.mappings })}{s.schedule ? ` · ${t('rpConn.scheduled')}` : ` · ${t('rpConn.manual')}`}</p>
              </div>
              {canManage && (
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  <button onClick={() => void onToggle(s)} disabled={busy} className="rounded border px-2 py-1 text-[10px] font-medium hover:bg-muted disabled:opacity-50">
                    {s.status === 'paused' ? t('rpConn.resume') : t('rpConn.pause')}
                  </button>
                  {s.type === 'google_sheets' && (
                    <button onClick={() => void onSync(s)} disabled={busy} className="inline-flex items-center gap-1 rounded border border-primary/40 bg-primary/5 px-2 py-1 text-[10px] font-semibold text-primary hover:bg-primary/10 disabled:opacity-50">
                      <Play className="h-3 w-3" /> {t('rpConn.runSync')}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg border">
        <p className="flex items-center gap-1.5 border-b bg-muted/40 px-3 py-2 text-xs font-bold"><RefreshCw className="h-3.5 w-3.5 text-primary" />{t('rpConn.recentSyncs')}</p>
        {recent.length === 0 ? (
          <p className="px-3 py-4 text-center text-[11px] text-muted-foreground">{t('rpConn.noSyncs')}</p>
        ) : (
          <ul className="divide-y">
            {recent.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 text-[11px]">
                <span className="truncate font-medium">{r.label ?? '—'}</span>
                <span className="flex items-center gap-2 text-muted-foreground">
                  <span>{t('rpConn.imported', { n: r.imported })}</span>
                  {r.rejected > 0 && <span className="text-red-600">{t('rpConn.rejected', { n: r.rejected })}</span>}
                  <span className="rounded-full bg-muted px-1.5 py-0.5 font-semibold">{t(`rpConn.run_${r.status}` as 'rpConn.run_success')}</span>
                  <span>{dt(r.at)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">{canManage ? t('rpConn.manageNote') : t('rpConn.readOnlyNote')}</p>
    </div>
  );
}
