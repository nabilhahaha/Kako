// ============================================================================
// Day Planner — saved day plans ("Jeddah VIP Tour", "Market Audit Route", …).
//
// A generated plan (its customers, order, start/end) can be saved under a name and
// reopened later without rebuilding. Small data → localStorage (same browser). A
// cross-device / shareable persistent plan belongs to the Field Missions backend;
// this is the lightweight local store for the Day Planner tool.
//
// Browser-only.
// ============================================================================
import type { DpCustomer } from '@/lib/tis/day-planner-import';
import type { JourneyPoint } from '@/lib/tis/journey';

export interface DpSavedPlan {
  id: string;
  name: string;
  customers: DpCustomer[]; // the planned subset, in no particular order
  order: string[];         // customer ids in visit order
  start: JourneyPoint | null;
  end: JourneyPoint | null;
  hasSales: boolean;
  createdAt: number;
}

const KEY = 'vantora-day-planner-plans';

function read(): DpSavedPlan[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as DpSavedPlan[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function write(list: DpSavedPlan[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* quota / private mode — ignore */
  }
}

export function loadDpPlans(): DpSavedPlan[] {
  return read().sort((a, b) => b.createdAt - a.createdAt);
}

/** Save (or replace, by exact name) a named day plan. Returns the new list + saved id. */
export function saveDpPlan(
  name: string,
  data: { customers: DpCustomer[]; order: string[]; start: JourneyPoint | null; end: JourneyPoint | null; hasSales: boolean },
): { plans: DpSavedPlan[]; id: string | null } {
  const clean = name.trim();
  if (!clean) return { plans: loadDpPlans(), id: null };
  const list = read().filter((p) => p.name.toLowerCase() !== clean.toLowerCase());
  const id = `plan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  list.push({ id, name: clean, ...data, createdAt: Date.now() });
  write(list);
  return { plans: loadDpPlans(), id };
}

export function deleteDpPlan(id: string): DpSavedPlan[] {
  write(read().filter((p) => p.id !== id));
  return loadDpPlans();
}

export function getDpPlan(id: string): DpSavedPlan | null {
  return read().find((p) => p.id === id) ?? null;
}

/**
 * A shareable token for a saved plan — the id, kept short. The Day Planner reads
 * `?plan=<id>` on open and restores it (same-browser). A true cross-device link
 * needs the Field Missions backend; this gives the local reopen + a copyable URL.
 */
export function planShareUrl(id: string): string {
  if (typeof window === 'undefined') return '';
  const u = new URL(window.location.href);
  u.searchParams.set('plan', id);
  return u.toString();
}
