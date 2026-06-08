'use client';

import { useCallback, useEffect, useState } from 'react';
import { Wifi, WifiOff, BatteryMedium, UploadCloud, Clock, AlertTriangle } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { StatCard } from '@/components/shared/stat-card';
import { Card, CardContent } from '@/components/ui/card';
import { useOnlineStatus, useBattery } from '@/lib/offline-sync/use-network';
import { enqueue, syncNow, pendingCount } from '@/lib/offline-sync/client';

export function OfflineClient() {
  const { t } = useI18n();
  const online = useOnlineStatus();
  const battery = useBattery();
  const [pending, setPending] = useState(0);
  const [conflicts, setConflicts] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => { setPending(await pendingCount()); }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  // Auto-sync when connectivity returns.
  useEffect(() => { if (online) doSync(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [online]);

  const doSync = useCallback(async () => {
    setSyncing(true);
    const r = await syncNow({ appVersion: 'pwa', platform: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 60) : 'web' });
    setConflicts((c) => c + r.conflicts);
    await refresh();
    setSyncing(false);
    if (!r.offline && (r.synced || r.rejected)) setMsg(t('distribution.oflSyncedMsg'));
  }, [refresh, t]);

  const onQueue = useCallback(async (fd: FormData) => {
    const amount = Number(fd.get('amount'));
    if (!Number.isFinite(amount) || amount <= 0) return;
    await enqueue('van_expense', 'create', { amount, notes: String(fd.get('notes') || '') });
    setMsg(t('distribution.oflQueuedMsg'));
    await refresh();
    if (online) doSync();
  }, [online, refresh, doSync, t]);

  const batteryPct = battery.level == null ? '—' : `${Math.round(battery.level * 100)}%`;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={online ? t('distribution.oflOnline') : t('distribution.oflOffline')} value={online ? '✓' : '⚠'} icon={online ? Wifi : WifiOff} tone={online ? 'success' : 'warning'} />
        <StatCard label={t('distribution.oflBattery')} value={batteryPct} icon={BatteryMedium} tone="info" hint={battery.charging ? '⚡' : undefined} />
        <StatCard label={t('distribution.oflPending')} value={String(pending)} icon={Clock} tone={pending > 0 ? 'warning' : 'info'} />
        <StatCard label={t('distribution.oflConflicts')} value={String(conflicts)} icon={AlertTriangle} tone={conflicts > 0 ? 'destructive' : 'info'} />
      </div>

      <button onClick={doSync} disabled={syncing || !online} className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60">
        <UploadCloud className="h-4 w-4" /> {syncing ? t('distribution.oflSyncing') : t('distribution.oflSyncNow')}
      </button>

      <Card>
        <CardContent className="space-y-3 p-4">
          <h2 className="text-sm font-semibold">{t('distribution.oflAddExpenseTitle')}</h2>
          <form action={onQueue} className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">{t('distribution.oflAmount')}</label>
              <input name="amount" type="number" step="0.01" min="0" required className="h-9 w-32 rounded-md border bg-background px-2 text-sm" />
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <label className="text-xs text-muted-foreground">{t('distribution.oflNotes')}</label>
              <input name="notes" type="text" className="h-9 rounded-md border bg-background px-2 text-sm" />
            </div>
            <button type="submit" className="h-9 rounded-md border px-4 text-sm font-medium">{t('distribution.oflQueue')}</button>
          </form>
          {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
