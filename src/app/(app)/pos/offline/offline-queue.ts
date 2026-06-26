// Fast Food POS — OFFLINE sale queue + sync-status model (pure, no I/O / no React).
//
// When the connection drops, a completed sale is captured here with FROZEN prices and a
// client-generated UUID (the idempotency key, 0391), a local temp number, and a sync status.
// When online returns, each sale is submitted ONCE via posCheckout(clientUuid=localUuid); the
// server assigns the official ZATCA invoice number exactly once. Pure so the status machine is
// unit-tested and identical wherever it runs.

import type { OrderMode, DiscountType } from '../pos-cart';

export type SyncStatus = 'pending_sync' | 'syncing' | 'synced' | 'sync_failed';

/** The deterministic sale payload captured at sale time (prices frozen — sync never recomputes). */
export interface OfflineSalePayload {
  mode: OrderMode;
  tableId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  deliveryFee: number;
  discountType: DiscountType;
  discountValue: number;
  serviceRate: number;
  taxRate: number;
  orderNote: string | null;
  paymentMethod: 'cash' | 'card' | 'mixed';
  items: { productId: string; name: string; price: number; qty: number; note?: string | null }[];
  capturedTotal: number;   // grand total at sale time (for the local receipt / reconciliation)
}

export interface OfflineSale {
  localUuid: string;       // idempotency key → posCheckout clientUuid
  tempNumber: string;      // local temp receipt no (OFF-…)
  companyId: string;
  cashier: string | null;
  createdAt: string;       // local ISO
  status: SyncStatus;
  attempts: number;
  lastError: string | null;
  syncedInvoiceId: string | null;
  syncedInvoiceNumber: string | null;
  sale: OfflineSalePayload;
}

/** Build a new queued sale (status pending_sync). Pure. */
export function newOfflineSale(input: { localUuid: string; tempNumber: string; companyId: string; cashier: string | null; createdAt: string; sale: OfflineSalePayload }): OfflineSale {
  return {
    localUuid: input.localUuid, tempNumber: input.tempNumber, companyId: input.companyId,
    cashier: input.cashier, createdAt: input.createdAt, status: 'pending_sync', attempts: 0,
    lastError: null, syncedInvoiceId: null, syncedInvoiceNumber: null, sale: input.sale,
  };
}

export const markSyncing = (s: OfflineSale): OfflineSale => ({ ...s, status: 'syncing', attempts: s.attempts + 1, lastError: null });
export const markSynced = (s: OfflineSale, invoiceId: string, invoiceNumber: string): OfflineSale => ({ ...s, status: 'synced', syncedInvoiceId: invoiceId, syncedInvoiceNumber: invoiceNumber, lastError: null });
export const markFailed = (s: OfflineSale, error: string): OfflineSale => ({ ...s, status: 'sync_failed', lastError: error });

/** Sales that should be (re)submitted: never-synced or previously failed. Order preserved. Pure. */
export function syncable(list: readonly OfflineSale[]): OfflineSale[] {
  return list.filter((s) => s.status === 'pending_sync' || s.status === 'sync_failed');
}

export interface StatusCounts { pending: number; syncing: number; synced: number; failed: number; total: number }
export function statusCounts(list: readonly OfflineSale[]): StatusCounts {
  const c: StatusCounts = { pending: 0, syncing: 0, synced: 0, failed: 0, total: list.length };
  for (const s of list) {
    if (s.status === 'pending_sync') c.pending++;
    else if (s.status === 'syncing') c.syncing++;
    else if (s.status === 'synced') c.synced++;
    else if (s.status === 'sync_failed') c.failed++;
  }
  return c;
}

/** A short, sortable local temp number, e.g. OFF-26063023401. Pure (timestamp injected). */
export function tempNumber(nowMs: number): string {
  return 'OFF-' + Math.floor(nowMs / 1000).toString(36).toUpperCase();
}
