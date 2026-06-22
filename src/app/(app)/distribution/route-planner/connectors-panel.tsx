'use client';

import { useEffect, useState } from 'react';
import { Plug, CheckCircle2, PauseCircle, AlertTriangle, RefreshCw, Clock } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { getConnectors, type DataSourceRow, type SyncRunRow } from './rp-connectors-read-actions';

/**
 * Phase C4 — read-only connectors/import admin. Lists data sources (status, last sync,
 * mappings) and recent sync runs. No writes; no connector config/secrets are read.
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

  useEffect(() => {
    void (async () => {
      const res = await getConnectors();
      if (res.ok) { setSources(res.data.sources); setRecent(res.data.recentSyncs); setHealthy(res.data.healthy); }
      setLoaded(true);
    })();
  }, []);

  const dt = (s: string | null) => (s ? new Date(s).toLocaleString(locale === 'ar' ? 'ar' : 'en', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

  if (!loaded) return <p className="px-3 py-6 text-center text-xs text-muted-foreground">{t('rpConn.loading')}</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Plug className="h-4 w-4 text-primary" />
        <p className="text-sm font-bold">{t('rpConn.title')}</p>
        <span className="text-[11px] text-muted-foreground">{t('rpConn.healthyOf', { h: healthy, n: sources.length })}</span>
      </div>

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

      <p className="text-[11px] text-muted-foreground">{t('rpConn.readOnlyNote')}</p>
    </div>
  );
}
