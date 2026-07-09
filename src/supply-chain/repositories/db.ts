/**
 * Minimal, dependency-free Promise wrapper over IndexedDB. This is the ONLY
 * file that talks to IndexedDB directly; everything else goes through the
 * repository interfaces, so the storage engine can later be swapped for a REST
 * API / Supabase without touching services or UI.
 */

export const DB_NAME = 'scv-db';
export const DB_VERSION = 1;

export const STORES = {
  pis: 'pis',
  piLines: 'piLines',
  deliveryNotes: 'deliveryNotes',
  deliveryNoteLines: 'deliveryNoteLines',
  invoices: 'invoices',
  invoiceLines: 'invoiceLines',
  exceptions: 'exceptions',
  validationResults: 'validationResults',
  auditLogs: 'auditLogs',
  config: 'config',
} as const;

export type StoreName = (typeof STORES)[keyof typeof STORES];

interface IndexSpec {
  name: string;
  keyPath: string;
}

const INDEXES: Partial<Record<StoreName, IndexSpec[]>> = {
  piLines: [{ name: 'piId', keyPath: 'piId' }],
  deliveryNotes: [{ name: 'piId', keyPath: 'piId' }],
  deliveryNoteLines: [{ name: 'piId', keyPath: 'piId' }],
  invoices: [{ name: 'piId', keyPath: 'piId' }],
  invoiceLines: [{ name: 'invoiceId', keyPath: 'invoiceId' }],
  exceptions: [{ name: 'piId', keyPath: 'piId' }],
  validationResults: [{ name: 'piId', keyPath: 'piId' }],
};

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this environment.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const store of Object.values(STORES)) {
        if (!db.objectStoreNames.contains(store)) {
          const os = db.createObjectStore(store, { keyPath: 'id' });
          for (const idx of INDEXES[store] ?? []) {
            os.createIndex(idx.name, idx.keyPath, { unique: false });
          }
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(
  store: StoreName,
  mode: IDBTransactionMode,
): Promise<IDBObjectStore> {
  const db = await openDb();
  return db.transaction(store, mode).objectStore(store);
}

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function dbGetAll<T>(store: StoreName): Promise<T[]> {
  const os = await tx(store, 'readonly');
  return promisify(os.getAll() as IDBRequest<T[]>);
}

export async function dbGet<T>(store: StoreName, id: string): Promise<T | undefined> {
  const os = await tx(store, 'readonly');
  return promisify(os.get(id) as IDBRequest<T | undefined>);
}

export async function dbGetByIndex<T>(
  store: StoreName,
  index: string,
  value: IDBValidKey,
): Promise<T[]> {
  const os = await tx(store, 'readonly');
  return promisify(os.index(index).getAll(value) as IDBRequest<T[]>);
}

export async function dbPut<T>(store: StoreName, value: T): Promise<T> {
  const os = await tx(store, 'readwrite');
  await promisify(os.put(value));
  return value;
}

export async function dbBulkPut<T>(store: StoreName, values: T[]): Promise<void> {
  if (values.length === 0) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(store, 'readwrite');
    const os = transaction.objectStore(store);
    for (const v of values) os.put(v);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function dbDelete(store: StoreName, id: string): Promise<void> {
  const os = await tx(store, 'readwrite');
  await promisify(os.delete(id));
}

export async function dbClear(store: StoreName): Promise<void> {
  const os = await tx(store, 'readwrite');
  await promisify(os.clear());
}

export async function dbClearAll(): Promise<void> {
  await Promise.all(Object.values(STORES).map((s) => dbClear(s)));
}
