// ============================================================================
// Route Planner — local draft persistence (Auto Save + Draft Recovery).
//
// The planner is session-only (it never writes to live company data), so a manager's
// in-progress work must survive Back / Refresh / tab-close / disconnect. We persist the
// full planner snapshot to IndexedDB — which, unlike localStorage's ~5 MB cap, handles
// thousands of customers via structured clone with no JSON size limit.
//
// Browser-only; all calls happen from client effects / handlers.
// ============================================================================
import type { TisDataset } from '@/lib/tis/dataset';
import type { Scenario } from '@/lib/tis/scenario';

export interface PlannerDraft {
  v: 1;
  savedAt: number;
  dataset: TisDataset;
  scenario: Scenario;
  baseline: Scenario | null;
  method: 'assisted' | 'manual' | 'current' | null;
  allocView: 'current' | 'proposed';
  generated: boolean;
  approved: boolean;
  exported: boolean;
  routeCount: string;
  targetRoute: string;
  focusedRoutes: string[];
  selectedIds: string[];
  selectMode: 'pan' | 'box' | 'draw';
  showAllBoundaries: boolean;
  showOnlySelected: boolean;
  compactList: boolean;
  sortKey: 'route' | 'customers' | 'workload' | 'sales' | 'salesPerCustomer';
  sortDir: 'desc' | 'asc';
}

const DB_NAME = 'vantora-route-planner';
const STORE = 'drafts';
const KEY = 'current';
const DB_VERSION = 1;

function idbAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Persist the latest planner snapshot (overwrites the previous draft). Never throws. */
export async function savePlannerDraft(draft: PlannerDraft): Promise<void> {
  if (!idbAvailable()) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(draft, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* best-effort — quota / private mode / etc. */
  }
}

/** Load the saved draft, or null when none / unavailable. */
export async function loadPlannerDraft(): Promise<PlannerDraft | null> {
  if (!idbAvailable()) return null;
  try {
    const db = await openDb();
    const draft = await new Promise<PlannerDraft | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as PlannerDraft) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (draft && draft.v === 1 && draft.dataset) return draft;
    return null;
  } catch {
    return null;
  }
}

/** Delete the saved draft. */
export async function clearPlannerDraft(): Promise<void> {
  if (!idbAvailable()) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* ignore */
  }
}
