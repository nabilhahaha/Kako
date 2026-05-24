// Offline Sync Engine for Roshen Field Intelligence Platform
// Uses IndexedDB for local storage and background sync

const DB_NAME = 'roshen-field-sync';
const DB_VERSION = 1;

const STORES = {
  PENDING_VISITS: 'pending_visits',
  PENDING_PHOTOS: 'pending_photos',
  CACHED_CUSTOMERS: 'cached_customers',
  CACHED_FORMS: 'cached_forms',
  SYNC_QUEUE: 'sync_queue',
} as const;

// --- Types ---

export interface PendingVisit {
  localId: string;
  customerId: string;
  visitType: string;
  latitude: number | null;
  longitude: number | null;
  notes: string | null;
  reasonIds: string[];
  createdAt: string;
  synced: boolean;
  serverId?: string;
}

export interface SyncQueueItem {
  id: string;
  entity: string;
  action: 'create' | 'update' | 'delete';
  payload: unknown;
  createdAt: string;
  retries: number;
}

export interface OfflineStats {
  pendingVisits: number;
  pendingPhotos: number;
  queueSize: number;
}

// --- Database Initialization ---

let dbInstance: IDBDatabase | null = null;

function getDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);
  return initOfflineDB();
}

export function initOfflineDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Pending visits store
      if (!db.objectStoreNames.contains(STORES.PENDING_VISITS)) {
        const visitStore = db.createObjectStore(STORES.PENDING_VISITS, {
          keyPath: 'localId',
        });
        visitStore.createIndex('synced', 'synced', { unique: false });
        visitStore.createIndex('customerId', 'customerId', { unique: false });
        visitStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // Pending photos store
      if (!db.objectStoreNames.contains(STORES.PENDING_PHOTOS)) {
        const photoStore = db.createObjectStore(STORES.PENDING_PHOTOS, {
          keyPath: 'id',
        });
        photoStore.createIndex('visitLocalId', 'visitLocalId', {
          unique: false,
        });
        photoStore.createIndex('synced', 'synced', { unique: false });
      }

      // Cached customers store
      if (!db.objectStoreNames.contains(STORES.CACHED_CUSTOMERS)) {
        const customerStore = db.createObjectStore(STORES.CACHED_CUSTOMERS, {
          keyPath: 'id',
        });
        customerStore.createIndex('customer_code', 'customer_code', {
          unique: false,
        });
      }

      // Cached forms store
      if (!db.objectStoreNames.contains(STORES.CACHED_FORMS)) {
        db.createObjectStore(STORES.CACHED_FORMS, { keyPath: 'form_key' });
      }

      // Sync queue store
      if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
        const queueStore = db.createObjectStore(STORES.SYNC_QUEUE, {
          keyPath: 'id',
        });
        queueStore.createIndex('entity', 'entity', { unique: false });
        queueStore.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = (event.target as IDBOpenDBRequest).result;

      // Handle connection closing unexpectedly
      dbInstance.onclose = () => {
        dbInstance = null;
      };

      resolve(dbInstance);
    };

    request.onerror = () => {
      console.error('Failed to open IndexedDB:', request.error);
      reject(request.error);
    };
  });
}

// --- Generic helpers ---

function txPromise<T>(
  db: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const request = operation(store);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.onerror = () => reject(tx.error);
  });
}

function getAllFromStore<T>(
  db: IDBDatabase,
  storeName: string,
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

function getAllFromIndex<T>(
  db: IDBDatabase,
  storeName: string,
  indexName: string,
  value: IDBValidKey,
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const index = store.index(indexName);
    const request = index.getAll(value);

    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

function countFromIndex(
  db: IDBDatabase,
  storeName: string,
  indexName: string,
  value: IDBValidKey,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const index = store.index(indexName);
    const request = index.count(value);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function countStore(db: IDBDatabase, storeName: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.count();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// --- Pending Visits ---

export async function savePendingVisit(visit: PendingVisit): Promise<void> {
  const db = await getDB();
  await txPromise(db, STORES.PENDING_VISITS, 'readwrite', (store) =>
    store.put(visit),
  );
}

export async function getPendingVisits(): Promise<PendingVisit[]> {
  const db = await getDB();
  return getAllFromIndex<PendingVisit>(
    db,
    STORES.PENDING_VISITS,
    'synced',
    0, // IndexedDB stores booleans as 0/1 in indexes; false = 0
  ).catch(async () => {
    // Fallback: get all and filter manually
    const all = await getAllFromStore<PendingVisit>(db, STORES.PENDING_VISITS);
    return all.filter((v) => !v.synced);
  });
}

export async function markVisitSynced(
  localId: string,
  serverId: string,
): Promise<void> {
  const db = await getDB();
  const visit = await txPromise<PendingVisit | undefined>(
    db,
    STORES.PENDING_VISITS,
    'readonly',
    (store) => store.get(localId),
  );
  if (!visit) return;
  visit.synced = true;
  visit.serverId = serverId;
  await txPromise(db, STORES.PENDING_VISITS, 'readwrite', (store) =>
    store.put(visit),
  );
}

// --- Customer Caching ---

export async function cacheCustomers(customers: unknown[]): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.CACHED_CUSTOMERS, 'readwrite');
    const store = tx.objectStore(STORES.CACHED_CUSTOMERS);

    // Clear existing cache first
    store.clear();

    for (const customer of customers) {
      store.put(customer);
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getCachedCustomers(): Promise<unknown[]> {
  const db = await getDB();
  return getAllFromStore(db, STORES.CACHED_CUSTOMERS);
}

// --- Sync Queue ---

export async function addToSyncQueue(item: SyncQueueItem): Promise<void> {
  const db = await getDB();
  await txPromise(db, STORES.SYNC_QUEUE, 'readwrite', (store) =>
    store.put(item),
  );
}

export async function getSyncQueue(): Promise<SyncQueueItem[]> {
  const db = await getDB();
  return getAllFromStore<SyncQueueItem>(db, STORES.SYNC_QUEUE);
}

export async function removeSyncItem(id: string): Promise<void> {
  const db = await getDB();
  await txPromise(db, STORES.SYNC_QUEUE, 'readwrite', (store) =>
    store.delete(id),
  );
}

export async function updateSyncItemRetries(
  id: string,
  retries: number,
): Promise<void> {
  const db = await getDB();
  const item = await txPromise<SyncQueueItem | undefined>(
    db,
    STORES.SYNC_QUEUE,
    'readonly',
    (store) => store.get(id),
  );
  if (!item) return;
  item.retries = retries;
  await txPromise(db, STORES.SYNC_QUEUE, 'readwrite', (store) =>
    store.put(item),
  );
}

// --- Stats ---

export async function getOfflineStats(): Promise<OfflineStats> {
  const db = await getDB();

  const [pendingVisits, pendingPhotos, queueSize] = await Promise.all([
    countFromIndex(db, STORES.PENDING_VISITS, 'synced', 0).catch(async () => {
      // Fallback: count all unsynced
      const all = await getAllFromStore<PendingVisit>(db, STORES.PENDING_VISITS);
      return all.filter((v) => !v.synced).length;
    }),
    countFromIndex(db, STORES.PENDING_PHOTOS, 'synced', 0).catch(() => 0),
    countStore(db, STORES.SYNC_QUEUE),
  ]);

  return { pendingVisits, pendingPhotos, queueSize };
}
