'use client';

import { useEffect, useState } from 'react';
import { Database, CheckCircle2, Trash2, Star, FolderOpen } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { listDatasets, setActiveDataset, deleteDataset, type DatasetHeader } from './rp-dataset-actions';

/**
 * Wave B — Saved Datasets panel. Lists the persisted customer working sets (erp_rp_datasets)
 * visible to the user (own + reporting subtree), shows row / valid counts and the active
 * marker, and lets the owner set-active or delete. Read-mostly; mobile-friendly stacked rows.
 */
export function DatasetsPanel({ canManage = true, onChange, onLoad, loadingId = null }: { canManage?: boolean; onChange?: () => void | Promise<void>; onLoad?: (d: DatasetHeader) => void | Promise<void>; loadingId?: string | null }) {
  const { t } = useI18n();
  const [rows, setRows] = useState<DatasetHeader[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  async function refresh() {
    const res = await listDatasets();
    if (res.ok) setRows(res.data ?? []);
    setLoaded(true);
  }
  useEffect(() => { void refresh(); }, []);

  async function onSetActive(id: string) {
    setBusy(true);
    const res = await setActiveDataset(id);
    if (res.ok) { await refresh(); await onChange?.(); }  // re-feed the planning screens
    setBusy(false);
  }
  async function onDelete(id: string) {
    setBusy(true);
    const res = await deleteDataset(id);
    if (res.ok) { setConfirmId(null); await refresh(); await onChange?.(); }
    setBusy(false);
  }

  return (
    <div className="rounded-lg border">
      <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2">
        <Database className="h-4 w-4 text-primary" />
        <p className="text-xs font-bold">{t('rpShell.ds_title')}</p>
        {rows.length > 0 && <span className="text-[11px] text-muted-foreground">({rows.length})</span>}
      </div>
      {rows.length > 0 && <p className="border-b bg-muted/20 px-3 py-1.5 text-[11px] text-muted-foreground">{t('rpShell.ds_loadHint')}</p>}

      {loaded && rows.length === 0 && (
        <p className="px-3 py-4 text-center text-xs text-muted-foreground">{t('rpShell.ds_empty')}</p>
      )}

      <ul className="divide-y">
        {rows.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                {d.isActive && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />}
                <span className="truncate text-xs font-medium">{d.name}</span>
                {d.isActive && <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">{t('rpShell.ds_active')}</span>}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {d.source} · {t('rpShell.ds_rows', { n: d.rowCount })} · {t('rpShell.ds_valid', { n: d.validCount })}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {onLoad && (
                <button onClick={() => void onLoad(d)} disabled={busy || loadingId === d.id}
                  className="flex items-center gap-1 rounded border border-primary/40 bg-primary/5 px-2 py-1 text-[11px] font-semibold text-primary hover:bg-primary/10 disabled:opacity-50">
                  <FolderOpen className="h-3 w-3" /> {loadingId === d.id ? t('rpShell.ds_loading') : t('rpShell.ds_load')}
                </button>
              )}
              {canManage && (
                <>
                {!d.isActive && (
                  <button onClick={() => void onSetActive(d.id)} disabled={busy}
                    className="flex items-center gap-1 rounded border px-2 py-1 text-[11px] hover:bg-muted disabled:opacity-50">
                    <Star className="h-3 w-3" /> {t('rpShell.ds_setActive')}
                  </button>
                )}
                {confirmId === d.id ? (
                  <button onClick={() => void onDelete(d.id)} disabled={busy}
                    className="rounded border border-red-300 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50">
                    {t('rpShell.ds_deleteConfirm')}
                  </button>
                ) : (
                  <button onClick={() => setConfirmId(d.id)} disabled={busy}
                    className="text-muted-foreground hover:text-red-600" title={t('rpShell.ds_delete')}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
