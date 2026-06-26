'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { posCheckout } from '../pos-actions';
import { syncable, markSyncing, markSynced, markFailed, statusCounts, type StatusCounts } from './offline-queue';
import type { OfflineStore } from './offline-store';

/**
 * Drains the offline sale queue when the connection returns. Each queued sale is submitted via
 * posCheckout with clientUuid = its localUuid, so the server issues the official ZATCA invoice
 * number EXACTLY ONCE per sale (0391 idempotency) — re-runs and overlapping drains can never
 * mint a duplicate. Sales sync in order, one at a time; failures are kept locally as
 * sync_failed for retry. No deletion: synced sales remain (status 'synced') for audit until a
 * future prune. Online-first: nothing is submitted while offline.
 */
export function useOfflineSync(store: OfflineStore, online: boolean) {
  const [counts, setCounts] = useState<StatusCounts>(() => statusCounts(store.list()));
  const draining = useRef(false);
  const refresh = useCallback(() => setCounts(statusCounts(store.list())), [store]);

  const drain = useCallback(async () => {
    if (draining.current) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    draining.current = true;
    try {
      for (const s of syncable(store.list())) {
        store.put(markSyncing(s)); refresh();
        try {
          const res = await posCheckout({
            mode: s.sale.mode, tableId: s.sale.tableId, customerName: s.sale.customerName,
            customerPhone: s.sale.customerPhone, customerAddress: s.sale.customerAddress, deliveryFee: s.sale.deliveryFee,
            discountType: s.sale.discountType, discountValue: s.sale.discountValue, serviceRate: s.sale.serviceRate,
            taxRate: s.sale.taxRate, orderNote: s.sale.orderNote, paymentMethod: s.sale.paymentMethod,
            items: s.sale.items, clientUuid: s.localUuid,
          });
          if (res.ok && res.data) store.put(markSynced(s, res.data.invoiceId, res.data.invoiceNumber));
          else store.put(markFailed(s, res.ok ? 'no_invoice' : (res.error ?? 'sync_failed')));
        } catch (e) {
          store.put(markFailed(s, e instanceof Error ? e.message : 'sync_error'));
        }
        refresh();
      }
    } finally {
      draining.current = false;
    }
  }, [store, refresh]);

  // Auto-drain whenever we are (or become) online.
  useEffect(() => { if (online) void drain(); }, [online, drain]);

  return { counts, drain, refresh };
}
