'use client';

// ============================================================================
// Persistent offline status bar (Step 1 — Mobile Field Client). A slim, app-wide
// strip that surfaces network state + queued-mutation count + a one-tap "Sync
// now", so a field user sees queue/sync/device status from ANY screen — not only
// the /field/offline surface. Self-effacing: renders nothing while online with an
// empty queue. Reuses the pure offline engine (client.ts) + network hooks. Mounted
// only when KAKO_MOBILE is on (gated by the server layout).
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { Wifi, WifiOff, UploadCloud, Clock, AlertTriangle } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { useOnlineStatus } from '@/lib/offline-sync/use-network';
import { syncNow, pendingCount } from '@/lib/offline-sync/client';

/** Best-effort one-shot geolocation (resolves null if denied/unavailable). */
function getPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 4000, maximumAge: 60000 },
    );
  });
}

export function OfflineStatusBar() {
  const { t } = useI18n();
  const online = useOnlineStatus();
  const [pending, setPending] = useState(0);
  const [conflicts, setConflicts] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => { setPending(await pendingCount()); }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  const doSync = useCallback(async () => {
    if (!online) return;
    setSyncing(true);
    const pos = await getPosition();
    const r = await syncNow({
      appVersion: 'pwa',
      platform: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 60) : 'web',
      ...(pos ? { lat: pos.lat, lng: pos.lng } : {}),
    });
    setConflicts((c) => c + r.conflicts);
    await refresh();
    setSyncing(false);
  }, [online, refresh]);

  // Auto-drain the queue the moment connectivity returns.
  useEffect(() => { if (online && pending > 0) doSync(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [online]);

  // Stay out of the way when there's nothing to show.
  if (online && pending === 0 && conflicts === 0) return null;

  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-4 py-1.5 text-xs lg:px-6 ${online ? 'bg-warning/10 text-warning-foreground' : 'bg-destructive/10 text-destructive'}`}>
      <span className="inline-flex items-center gap-1 font-medium">
        {online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
        {online ? t('distribution.oflOnline') : t('distribution.oflOffline')}
      </span>
      {pending > 0 && (
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" /> {t('distribution.oflPending')}: {pending}
        </span>
      )}
      {conflicts > 0 && (
        <span className="inline-flex items-center gap-1 text-destructive">
          <AlertTriangle className="h-3.5 w-3.5" /> {t('distribution.oflConflicts')}: {conflicts}
        </span>
      )}
      {online && pending > 0 && (
        <button
          onClick={doSync}
          disabled={syncing}
          className="ms-auto inline-flex items-center gap-1 rounded-md border border-current/30 px-2 py-0.5 font-medium hover:bg-current/10 disabled:opacity-60"
        >
          <UploadCloud className="h-3.5 w-3.5" /> {syncing ? t('distribution.oflSyncing') : t('distribution.oflSyncNow')}
        </button>
      )}
    </div>
  );
}
