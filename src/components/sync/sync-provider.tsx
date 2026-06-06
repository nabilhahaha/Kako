'use client';

import { useEffect } from 'react';
import { isSyncEnabledClient } from '@/lib/sync/flag';
import { syncStatusStore } from './sync-status-store';

// Boots the offline-safe sync engine in the browser when KAKO_SYNC is enabled.
// Dynamically imports the engine/store so none of it ships in the bundle (or
// runs) for the current production app, where the flag is off → this is a no-op.
//
// Wires: durable IndexedDB outbox → SyncEngine(WebTransport, §14 policy) →
// SyncOrchestrator (connectivity + auto-sync), publishing to the shared status
// store the SyncBadge reads. Entities sync from the locked classification.
const SYNC_ENTITIES = ['orders', 'visits', 'customers', 'products', 'settings', 'inventory_counts', 'audit_logs'];

export function SyncProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!isSyncEnabledClient() || typeof window === 'undefined') return;
    let stop: (() => void) | undefined;
    let closed = false;

    (async () => {
      const [{ WebLocalStore }, { WebTransport }, { SyncOrchestrator }, { SyncEngine }, { clientPolicyFor }] =
        await Promise.all([
          import('@/lib/sync/web/web-store'),
          import('@/lib/sync/web/transport'),
          import('@/lib/sync/web/orchestrator'),
          import('@/lib/sync/engine'),
          import('@/lib/sync/policy'),
        ]);
      if (closed) return;
      const store = await WebLocalStore.open();
      const engine = new SyncEngine(store, new WebTransport(), { policyFor: clientPolicyFor });
      const orch = new SyncOrchestrator(store, engine, syncStatusStore, { entities: SYNC_ENTITIES });
      await orch.start();
      stop = () => { orch.stop(); store.close(); };
    })().catch((e) => console.error('sync provider init failed', e));

    return () => { closed = true; stop?.(); };
  }, []);

  return <>{children}</>;
}
