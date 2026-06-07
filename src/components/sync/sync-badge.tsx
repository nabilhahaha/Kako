'use client';

import { useSyncExternalStore } from 'react';
import { Cloud, CloudOff, RefreshCw, Check, AlertTriangle } from 'lucide-react';
import { isSyncEnabledClient } from '@/lib/sync/flag';
import { syncStatusStore } from './sync-status-store';
import type { SyncStatus } from '@/lib/sync/web/status';

const META: Record<SyncStatus, { label: string; cls: string; Icon: typeof Cloud; spin?: boolean }> = {
  online: { label: 'متصل', cls: 'text-muted-foreground', Icon: Cloud },
  offline: { label: 'بدون اتصال', cls: 'text-warning', Icon: CloudOff },
  syncing: { label: 'جارٍ المزامنة', cls: 'text-primary', Icon: RefreshCw, spin: true },
  synced: { label: 'تمت المزامنة', cls: 'text-success', Icon: Check },
  'sync-failed': { label: 'فشل المزامنة', cls: 'text-destructive', Icon: AlertTriangle },
};

/** Compact sync-status pill. Renders nothing unless KAKO_SYNC is enabled, so it
 *  is inert in the current production app. */
export function SyncBadge() {
  const snap = useSyncExternalStore(
    syncStatusStore.subscribe,
    syncStatusStore.getSnapshot,
    syncStatusStore.getSnapshot, // server snapshot (SSR-safe)
  );
  if (!isSyncEnabledClient()) return null;

  const m = META[snap.status];
  const Icon = m.Icon;
  const pending = snap.pending > 0 ? ` (${snap.pending})` : '';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${m.cls}`}
      title={snap.lastSyncedAt ? `آخر مزامنة: ${new Date(snap.lastSyncedAt).toLocaleString()}` : undefined}
      role="status"
      aria-live="polite"
    >
      <Icon className={`h-3.5 w-3.5 ${m.spin ? 'animate-spin' : ''}`} />
      {m.label}{pending}
    </span>
  );
}
