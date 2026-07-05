import type { PendingVisit } from '@/types'

const DB_NAME = 'roshen-visit-log'
const DB_VERSION = 1
const STORE = 'pending-visits'

/** Notified whenever the outbox changes so React Query can refetch it. */
export const OUTBOX_EVENT = 'vl-outbox-changed'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: 'localId' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open offline storage'))
  })
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const request = fn(tx.objectStore(STORE))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('Offline storage error'))
    })
  } finally {
    db.close()
  }
}

function notifyChanged() {
  window.dispatchEvent(new Event(OUTBOX_EVENT))
}

export async function addPendingVisit(visit: PendingVisit): Promise<void> {
  await withStore('readwrite', (store) => store.put(visit))
  notifyChanged()
}

export async function listPendingVisits(): Promise<PendingVisit[]> {
  const items = await withStore<PendingVisit[]>('readonly', (store) => store.getAll())
  return items.sort((a, b) => a.queued_at.localeCompare(b.queued_at))
}

export async function removePendingVisit(localId: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(localId))
  notifyChanged()
}
