'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getFieldOutbox, type OutboxStatus } from './field-outbox';
import { syncOutbox } from '@/app/(app)/field/actions';

/** ── useFieldSync (FE-2c) ───────────────────────────────────────────────────
 *  Drives the persistent offline outbox: stamps clientRef + capturedAt at action
 *  time, drains to the idempotent endpoint on reconnect / tab-focus / interval /
 *  manual "Sync now", and exposes live counts for the status indicator. */

type Counts = Record<OutboxStatus, number>;
const ZERO: Counts = { queued: 0, syncing: 0, synced: 0, failed: 0 };

export interface StartInput { customerId: string; lat?: number | null; lng?: number | null; accuracy?: number | null; routeId?: string | null; reason?: string | null; photo?: string | null; }
export interface EndInput { lat?: number | null; lng?: number | null; }

export function useFieldSync(pollMs = 30_000) {
  const outbox = getFieldOutbox();
  const [counts, setCounts] = useState<Counts>(ZERO);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);

  const refresh = useCallback(async () => { setCounts(await outbox.counts()); }, [outbox]);

  const syncNow = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true; setSyncing(true);
    try {
      await outbox.drain({ sync: (items) => syncOutbox(items) });
      await outbox.clearSynced();
    } finally {
      syncingRef.current = false; setSyncing(false);
      await refresh();
    }
  }, [outbox, refresh]);

  const enqueueStart = useCallback(async (input: StartInput, photo?: Blob): Promise<string> => {
    const clientRef = crypto.randomUUID();
    await outbox.enqueue({ kind: 'start', clientRef, capturedAt: new Date().toISOString(), ...input }, photo);
    await refresh();
    if (typeof navigator !== 'undefined' && navigator.onLine) void syncNow();
    return clientRef;
  }, [outbox, refresh, syncNow]);

  const enqueueEnd = useCallback(async (clientRef: string, input: EndInput = {}): Promise<void> => {
    await outbox.enqueue({ kind: 'end', clientRef, capturedAt: new Date().toISOString(), ...input });
    await refresh();
    if (typeof navigator !== 'undefined' && navigator.onLine) void syncNow();
  }, [outbox, refresh, syncNow]);

  useEffect(() => {
    setOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);
    void refresh();
    const onOnline = () => { setOnline(true); void syncNow(); };
    const onOffline = () => setOnline(false);
    const onVisible = () => { if (document.visibilityState === 'visible' && navigator.onLine) void syncNow(); };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(() => { if (navigator.onLine) void syncNow(); else void refresh(); }, pollMs);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, [refresh, syncNow, pollMs]);

  const pending = counts.queued + counts.syncing + counts.failed;
  return { counts, pending, online, syncing, syncNow, refresh, enqueueStart, enqueueEnd };
}
