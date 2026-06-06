'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n/provider';
import { useConfirm } from '@/components/confirm-dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { formatDateTime } from '@/lib/utils';
import {
  exportBackup, createBackupNow, updateBackupSchedule, downloadStoredBackup,
  restorePreview, restoreApply, type RestorePreview,
} from './actions';
import { Loader2, Download, Database, CalendarClock, Upload, ShieldCheck } from 'lucide-react';

export interface StoredBackup { id: string; kind: 'manual' | 'scheduled'; created_at: string; record_counts: Record<string, number> | null }

const RESTORE_ROWS = ['products', 'customers', 'suppliers', 'inventory', 'invoices', 'installments'] as const;

function downloadJson(filename: string, json: string) {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

export function BackupManager({
  counts, frequency, retention, lastBackupAt, backups,
}: {
  counts: { products: number; customers: number; invoices: number };
  frequency: 'off' | 'daily' | 'weekly';
  retention: number;
  lastBackupAt: string | null;
  backups: StoredBackup[];
}) {
  const { t } = useI18n();
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [freq, setFreq] = useState(frequency);
  const [keep, setKeep] = useState(retention);

  // Restore state
  const [restoreJson, setRestoreJson] = useState<string | null>(null);
  const [preview, setPreview] = useState<RestorePreview | null>(null);

  function onExport() {
    start(async () => {
      const res = await exportBackup();
      if (!res.ok || !res.data) { toast.error(res.error ?? ''); return; }
      downloadJson(res.data.filename, res.data.json);
      toast.success(t('settings.backup.done'));
    });
  }
  function onBackupNow() {
    start(async () => {
      const res = await createBackupNow();
      if (!res.ok) { toast.error(res.error ?? ''); return; }
      toast.success(t('settings.backup.backupNowDone'));
      router.refresh();
    });
  }
  function onSaveSchedule() {
    start(async () => {
      const res = await updateBackupSchedule(freq, keep);
      if (!res.ok) { toast.error(res.error ?? ''); return; }
      toast.success(t('settings.backup.scheduleSaved'));
      router.refresh();
    });
  }
  function onDownloadStored(id: string) {
    start(async () => {
      const res = await downloadStoredBackup(id);
      if (!res.ok || !res.data) { toast.error(res.error ?? ''); return; }
      downloadJson(res.data.filename, res.data.json);
    });
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setPreview(null); setRestoreJson(null);
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setRestoreJson(String(reader.result ?? ''));
    reader.readAsText(file);
  }
  function onPreview() {
    if (!restoreJson) { toast.error(t('settings.restore.noFile')); return; }
    start(async () => {
      const res = await restorePreview(restoreJson);
      if (!res.ok || !res.data) { toast.error(res.error ?? ''); setPreview(null); return; }
      setPreview(res.data);
    });
  }
  function onConfirmRestore() {
    if (!restoreJson) return;
    confirm({ title: t('settings.restore.confirm'), message: `${t('settings.restore.confirmMsg')}\n\n${t('settings.restore.note')}`, confirmText: t('settings.restore.confirm') }).then((ok) => {
      if (!ok) return;
      start(async () => {
        const res = await restoreApply(restoreJson);
        if (!res.ok) { toast.error(res.error ?? ''); return; }
        toast.success(t('settings.restore.restoreDone'));
        setPreview(null); setRestoreJson(null);
        router.refresh();
      });
    });
  }

  return (
    <div className="space-y-5">
      {/* Manual export + backup now */}
      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center gap-2 font-semibold"><Database className="h-5 w-5" /> {t('settings.backup.heading')}</div>
          <p className="text-sm text-muted-foreground">{t('settings.backup.note')}</p>
          <div className="grid grid-cols-3 gap-3 text-center">
            {([['products', counts.products], ['customers', counts.customers], ['invoices', counts.invoices]] as const).map(([k, n]) => (
              <div key={k} className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">{t(`settings.backup.${k}` as 'settings.backup.products')}</p>
                <p className="text-lg font-bold tabular-nums" dir="ltr">{n}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={onExport} disabled={pending} variant="outline" className="gap-1.5"><Download className="h-4 w-4" /> {t('settings.backup.download')}</Button>
            <Button onClick={onBackupNow} disabled={pending} className="gap-1.5">{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />} {t('settings.backup.backupNow')}</Button>
          </div>
        </CardContent>
      </Card>

      {/* Automatic backup schedule */}
      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center gap-2 font-semibold"><CalendarClock className="h-5 w-5" /> {t('settings.backup.scheduleHeading')}</div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">{t('settings.backup.frequency')}</span>
              <select value={freq} onChange={(e) => setFreq(e.target.value as typeof freq)} className="h-10 rounded-md border bg-background px-3">
                <option value="off">{t('settings.backup.freqOff')}</option>
                <option value="daily">{t('settings.backup.freqDaily')}</option>
                <option value="weekly">{t('settings.backup.freqWeekly')}</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">{t('settings.backup.retention')}</span>
              <Input type="number" min="1" max="60" dir="ltr" value={keep} onChange={(e) => setKeep(Number(e.target.value))} className="w-24" />
            </label>
            <Button onClick={onSaveSchedule} disabled={pending}>{t('settings.backup.saveSchedule')}</Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('settings.backup.lastBackup')}: <b dir="ltr">{lastBackupAt ? formatDateTime(lastBackupAt) : t('settings.backup.never')}</b>
          </p>
        </CardContent>
      </Card>

      {/* Recent stored backups */}
      <Card>
        <CardContent className="p-0">
          <h3 className="border-b p-3 text-sm font-semibold">{t('settings.backup.recentHeading')}</h3>
          {backups.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">{t('settings.backup.recentNone')}</p>
          ) : (
            <ul className="divide-y">
              {backups.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                  <span className="flex items-center gap-2">
                    <Badge variant={b.kind === 'scheduled' ? 'secondary' : 'default'}>{t(b.kind === 'scheduled' ? 'settings.backup.kindScheduled' : 'settings.backup.kindManual')}</Badge>
                    <span dir="ltr">{formatDateTime(b.created_at)}</span>
                  </span>
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => onDownloadStored(b.id)} className="gap-1.5"><Download className="h-3.5 w-3.5" /> {t('settings.backup.download')}</Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Restore — preview before execute, explicit confirm */}
      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center gap-2 font-semibold"><Upload className="h-5 w-5" /> {t('settings.restore.title')}</div>
          <p className="text-sm text-muted-foreground">{t('settings.restore.description')}</p>
          <div className="flex flex-wrap items-center gap-2">
            <input type="file" accept="application/json,.json" onChange={onFile} className="text-sm" />
            <Button onClick={onPreview} disabled={pending || !restoreJson} variant="outline" className="gap-1.5">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {t('settings.restore.previewBtn')}
            </Button>
          </div>

          {preview && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold">{t('settings.restore.previewHeading')}</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-secondary/50 text-muted-foreground">
                    <tr>
                      <th className="p-2 text-start font-medium">{t('settings.restore.colEntity')}</th>
                      <th className="p-2 text-end font-medium">{t('settings.restore.colNew')}</th>
                      <th className="p-2 text-end font-medium">{t('settings.restore.colExisting')}</th>
                      <th className="p-2 text-end font-medium">{t('settings.restore.colConflict')}</th>
                      <th className="p-2 text-end font-medium">{t('settings.restore.colSkip')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {RESTORE_ROWS.map((g) => {
                      const r = preview.entities[g] ?? { new: 0, existing: 0, conflict: 0, skip: 0 };
                      return (
                        <tr key={g} className="border-b last:border-0">
                          <td className="p-2">{t(`settings.restore.entity_${g}` as 'settings.restore.entity_products')}</td>
                          <td className="p-2 text-end tabular-nums text-success" dir="ltr">{r.new}</td>
                          <td className="p-2 text-end tabular-nums" dir="ltr">{r.existing}</td>
                          <td className="p-2 text-end tabular-nums text-warning" dir="ltr">{r.conflict}</td>
                          <td className="p-2 text-end tabular-nums text-muted-foreground" dir="ltr">{r.skip}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {preview.errors.length > 0 && (
                <ul className="list-disc space-y-0.5 ps-5 text-xs text-warning">
                  {preview.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              )}
              <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {t('settings.restore.note')}</p>
              <Button onClick={onConfirmRestore} disabled={pending} className="gap-1.5">
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {t('settings.restore.confirm')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
