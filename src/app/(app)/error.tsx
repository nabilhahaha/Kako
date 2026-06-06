'use client';

import { useEffect, useState } from 'react';
import * as Sentry from '@sentry/nextjs';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RotateCcw, WifiOff } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { isSyncEnabledClient } from '@/lib/sync/flag';

/**
 * Heuristic: does this error look like a dropped connection rather than a real
 * application fault? App Router soft-navigations, `router.refresh()` and Server
 * Actions all go over the network (RSC fetch); when the device is offline they
 * reject with a fetch/network error and land here. We don't want to show the
 * scary generic error (or spam Sentry) for that — it's just connectivity.
 */
function looksOffline(error: Error): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const m = `${error?.message ?? ''} ${error?.name ?? ''}`.toLowerCase();
  return /failed to fetch|load failed|networkerror|fetch failed|network request failed|err_internet|err_network|connection|offline/.test(m);
}

// In-app error boundary — keeps the sidebar/top-bar, reports to Sentry, and
// offers a retry. When the failure is just connectivity, it degrades to a
// friendly offline state and recovers automatically on reconnect.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useI18n();
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    // Offline-aware degradation is gated behind KAKO_SYNC; with the flag off the
    // boundary behaves exactly as before (generic error + Sentry report).
    const isOffline = isSyncEnabledClient() && looksOffline(error);
    setOffline(isOffline);
    // Only report genuine application faults — connectivity blips are expected.
    if (!isOffline) Sentry.captureException(error);
  }, [error]);

  // Offline path: auto-recover the moment the connection returns by re-running
  // the failed segment (server components re-fetch, data comes back).
  useEffect(() => {
    if (!offline) return;
    const onOnline = () => reset();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [offline, reset]);

  if (offline) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-4">
        <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <WifiOff className="h-7 w-7" />
          </div>
          <h1 className="text-lg font-bold">{t('common.offlineTitle')}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t('common.offlineBody')}</p>
          <p className="mt-3 text-xs text-muted-foreground">{t('common.offlineReconnecting')}</p>
          <Button variant="outline" className="mt-5" onClick={() => reset()}>
            <RotateCcw className="h-4 w-4" /> {t('common.errorRetry')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="h-7 w-7" />
        </div>
        <h1 className="text-lg font-bold">{t('common.errorTitle')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('common.errorBody')}</p>
        <Button className="mt-5" onClick={() => reset()}>
          <RotateCcw className="h-4 w-4" /> {t('common.errorRetry')}
        </Button>
      </div>
    </div>
  );
}
