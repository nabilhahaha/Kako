// ============================================================================
// Day Planner — local draft persistence (Auto Save + Draft Recovery).
//
// The Day Planner is session-only, so the manager's in-progress work — the
// uploaded file's columns/records, the column mapping, the selected customers,
// the Start/End points and the generated sequence — must survive Back / Refresh /
// tab-close. Persisted to IndexedDB (structured clone, no JSON size cap) in its
// OWN database so it never collides with the Route Planner draft store's version.
//
// Browser-only; all calls happen from client effects / handlers.
// ============================================================================
import type { DpMapping, DpCustomer } from '@/lib/tis/day-planner-import';
import type { JourneyPoint } from '@/lib/tis/journey';

export type DayPlannerStep = 'upload' | 'map' | 'plan';

export interface DayPlannerDraft {
  v: 1;
  savedAt: number;
  step: DayPlannerStep;
  fileName: string | null;
  headers: string[];
  records: Record<string, string>[];
  mapping: DpMapping;
  customers: DpCustomer[];
  hasSales: boolean;
  selectedIds: string[];
  start: JourneyPoint | null;
  end: JourneyPoint | null;
  order: string[] | null;
}

const DB_NAME = 'vantora-day-planner';
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

/** Persist the latest Day Planner snapshot (overwrites the previous draft). Never throws. */
export async function saveDayPlannerDraft(draft: DayPlannerDraft): Promise<void> {
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

/** Load the saved Day Planner draft, or null when none / unavailable. */
export async function loadDayPlannerDraft(): Promise<DayPlannerDraft | null> {
  if (!idbAvailable()) return null;
  try {
    const db = await openDb();
    const draft = await new Promise<DayPlannerDraft | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as DayPlannerDraft) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (draft && draft.v === 1) return draft;
    return null;
  } catch {
    return null;
  }
}

/** Delete the saved Day Planner draft. */
export async function clearDayPlannerDraft(): Promise<void> {
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
