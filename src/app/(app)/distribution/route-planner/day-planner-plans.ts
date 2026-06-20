// ============================================================================
// Day Planner — saved day plans ("Jeddah VIP Tour", "Market Audit Route", …).
//
// Wave C persistence: the source of truth is now the SERVER (erp_rp_day_plans, RLS) so a
// saved plan reopens across devices and the share link works cross-device. localStorage is
// kept as a first-paint CACHE + offline fallback; local-only plans migrate up on first load
// (idempotent by name). The customer subset is embedded in the plan, so a plan is
// self-contained (no dataset join required to reopen).
// ============================================================================
import type { DpCustomer } from '@/lib/tis/day-planner-import';
import type { JourneyPoint } from '@/lib/tis/journey';
import {
  listDayPlans, saveDayPlan as saveRemote, deleteDayPlan as deleteRemote, getDayPlan as getRemote,
  migrateLocalDayPlans, type SavedPlanRow,
} from './rp-plan-actions';

export interface DpSavedPlan {
  id: string;
  name: string;
  customers: DpCustomer[];
  order: string[];
  start: JourneyPoint | null;
  end: JourneyPoint | null;
  hasSales: boolean;
  createdAt: number;
}

const KEY = 'vantora-day-planner-plans';

interface DpPlanData { customers: DpCustomer[]; order: string[]; start: JourneyPoint | null; end: JourneyPoint | null; hasSales: boolean }

function rowToPlan(r: SavedPlanRow): DpSavedPlan {
  const p = r.plan as Partial<DpPlanData>;
  return {
    id: r.id, name: r.name, createdAt: r.createdAt,
    customers: p.customers ?? [], order: p.order ?? [],
    start: p.start ?? null, end: p.end ?? null, hasSales: Boolean(p.hasSales),
  };
}

// ── localStorage cache / offline-fallback tier ──────────────────────────────
function read(): DpSavedPlan[] {
  if (typeof localStorage === 'undefined') return [];
  try { const raw = localStorage.getItem(KEY); const l = raw ? (JSON.parse(raw) as DpSavedPlan[]) : []; return Array.isArray(l) ? l : []; } catch { return []; }
}
function write(list: DpSavedPlan[]): void {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* quota */ }
}

/** Synchronous cache read — instant first paint. */
export function loadDpPlans(): DpSavedPlan[] {
  return read().sort((a, b) => b.createdAt - a.createdAt);
}

let migrated = false;

/** Load plans from the server (migrating local-only on first call); cache fallback. */
export async function syncDpPlans(): Promise<DpSavedPlan[]> {
  const local = read();
  try {
    const res = migrated
      ? await listDayPlans()
      : await migrateLocalDayPlans(local.map((p) => ({ name: p.name, plan: { customers: p.customers, order: p.order, start: p.start, end: p.end, hasSales: p.hasSales } })));
    migrated = true;
    if (res.ok && res.data) { const list = res.data.map(rowToPlan); write(list); return list.sort((a, b) => b.createdAt - a.createdAt); }
  } catch { /* fall through */ }
  return loadDpPlans();
}

/** Save (or replace by exact name). Server-first; on failure, local-only fallback. */
export async function persistDpPlan(name: string, data: DpPlanData): Promise<{ plans: DpSavedPlan[]; id: string | null }> {
  const clean = name.trim();
  if (!clean) return { plans: loadDpPlans(), id: null };
  try {
    const res = await saveRemote(clean, { ...data });
    if (res.ok && res.data) { const plans = res.data.plans.map(rowToPlan); write(plans); return { plans, id: res.data.id }; }
  } catch { /* fall through */ }
  return saveLocal(clean, data);
}

export async function removeDpPlan(id: string): Promise<DpSavedPlan[]> {
  try {
    const res = await deleteRemote(id);
    if (res.ok && res.data) { const plans = res.data.map(rowToPlan); write(plans); return plans; }
  } catch { /* fall through */ }
  write(read().filter((p) => p.id !== id));
  return loadDpPlans();
}

/** Reopen a plan by id — server-first (cross-device), falling back to the local cache. */
export async function getDpPlanAsync(id: string): Promise<DpSavedPlan | null> {
  try { const res = await getRemote(id); if (res.ok && res.data) return rowToPlan(res.data); } catch { /* fall through */ }
  return read().find((p) => p.id === id) ?? null;
}

/** Synchronous cache lookup (instant ?plan= reopen before the server responds). */
export function getDpPlan(id: string): DpSavedPlan | null {
  return read().find((p) => p.id === id) ?? null;
}

// ── Local-only fallback writer ──────────────────────────────────────────────
function saveLocal(name: string, data: DpPlanData): { plans: DpSavedPlan[]; id: string } {
  const list = read().filter((p) => p.name.toLowerCase() !== name.toLowerCase());
  const id = `plan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  list.push({ id, name, ...data, createdAt: Date.now() });
  write(list);
  return { plans: loadDpPlans(), id };
}

/**
 * A shareable link for a saved plan — appends `?plan=<id>`. With server persistence the
 * id is global, so the link now opens the plan on any device (subject to RLS visibility).
 */
export function planShareUrl(id: string): string {
  if (typeof window === 'undefined') return '';
  const u = new URL(window.location.href);
  u.searchParams.set('plan', id);
  return u.toString();
}
