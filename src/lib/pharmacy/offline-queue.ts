'use client';

// ============================================================================
// Offline Pharmacy POS — on-device sale queue (IndexedDB). When the till is
// offline, a completed sale is stored here with a client-generated idempotency
// key and replayed through pharmacyCheckout when connectivity returns. The
// idempotency key (recorded server-side, 0286) makes the replay safe: a sale
// whose response was lost is never charged twice. Browser-only (guarded);
// feature-gated by pharmacy.offline_pos at the call sites.
// ============================================================================

import type { PharmacyCheckoutLine, PharmacyPrescription } from '@/app/(app)/pharmacy/pos/actions';
import type { PaymentMethod } from '@/lib/erp/types';

const DB_NAME = 'vantora-pharmacy-pos';
const STORE = 'sales';

/** A queued sale: the full checkout payload plus a stable idempotency key. */
export interface QueuedSale {
  idempotency_key: string;     // keyPath — client UUID, dedupes the replay
  queued_at: string;           // ISO
  branch_id: string;
  customer_id: string;
  lines: PharmacyCheckoutLine[];
  amount: number;
  payment_method: PaymentMethod;
  prescription?: PharmacyPrescription | null;
  /** Human label for the pending list (item count + total). */
  label: string;
}

function hasIDB(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = window.indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'idempotency_key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  }));
}

/** Queue a sale for later replay. Returns the idempotency key it was stored under. */
export async function queueSale(sale: Omit<QueuedSale, 'idempotency_key' | 'queued_at'>): Promise<string> {
  if (!hasIDB()) return '';
  const row: QueuedSale = { ...sale, idempotency_key: crypto.randomUUID(), queued_at: new Date().toISOString() };
  await tx('readwrite', (s) => s.put(row));
  return row.idempotency_key;
}

/** All queued sales, oldest first. */
export async function listQueuedSales(): Promise<QueuedSale[]> {
  if (!hasIDB()) return [];
  const all = await tx<QueuedSale[]>('readonly', (s) => s.getAll());
  return (all ?? []).sort((a, b) => a.queued_at.localeCompare(b.queued_at));
}

export async function queuedSaleCount(): Promise<number> {
  if (!hasIDB()) return 0;
  return tx<number>('readonly', (s) => s.count());
}

export async function removeQueuedSale(key: string): Promise<void> {
  if (!hasIDB()) return;
  await tx('readwrite', (s) => s.delete(key));
}
