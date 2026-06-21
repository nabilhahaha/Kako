// ============================================================================
// Saved Customer Segments — a named, reusable filter over the loaded customers
// (e.g. "Jeddah VIP A-class"). Used by the Customers screen and the Day Planner
// "Saved Segment" planning source.
//
// Wave A persistence: the source of truth is now the SERVER (erp_rp_segments, RLS,
// owner-scoped). localStorage is kept as a fast first-paint CACHE and an offline
// FALLBACK. On first load the client migrates any local-only segments up (idempotent),
// then reads from the server. Segments store the FILTER, not the customer rows, so they
// apply to whatever dataset is loaded.
// ============================================================================
import { listSegments, saveSegment as saveSegmentRemote, deleteSegment as deleteSegmentRemote, migrateLocalSegments } from './rp-planning-actions';

export interface SegmentFilter {
  search?: string;
  city?: string;
  area?: string;
  salesman?: string;
  channel?: string;
  class?: string;
}

export interface RpSegment {
  id: string;
  name: string;
  filter: SegmentFilter;
  createdAt: number;
}

const KEY = 'vantora-rp-segments';

// ── localStorage cache / offline-fallback tier ──────────────────────────────
function read(): RpSegment[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as RpSegment[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
function write(list: RpSegment[]): void {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* quota */ }
}

/** Synchronous cache read — used for instant first paint before the server responds. */
export function loadSegments(): RpSegment[] {
  return read().sort((a, b) => b.createdAt - a.createdAt);
}

// ── Server-backed orchestration (server is source of truth; cache mirrors it) ─
let migrated = false;

/**
 * Load segments from the server, migrating any local-only items up on the first call.
 * On any server error (unauthorised / offline) we fall back to the localStorage cache
 * so the tool keeps working. Always refreshes the cache with what we resolved.
 */
export async function syncSegments(): Promise<RpSegment[]> {
  const local = read();
  try {
    const res = migrated
      ? await listSegments()
      : await migrateLocalSegments(local.map((s) => ({ name: s.name, filter: s.filter as Record<string, string | undefined> })));
    migrated = true;
    if (res.ok && res.data) {
      const list = res.data as RpSegment[];
      write(list);
      return list.sort((a, b) => b.createdAt - a.createdAt);
    }
  } catch { /* fall through to cache */ }
  return loadSegments();
}

/** Save (or replace by exact name). Server-first; on failure, local-only fallback. */
export async function persistSegment(name: string, filter: SegmentFilter): Promise<RpSegment[]> {
  const clean = name.trim();
  if (!clean) return loadSegments();
  try {
    const res = await saveSegmentRemote(clean, filter as Record<string, string | undefined>);
    if (res.ok && res.data) { const list = res.data as RpSegment[]; write(list); return list; }
  } catch { /* fall through */ }
  return saveLocal(clean, filter);
}

/** Delete by id. Server-first; on failure, local-only fallback. */
export async function removeSegment(id: string): Promise<RpSegment[]> {
  try {
    const res = await deleteSegmentRemote(id);
    if (res.ok && res.data) { const list = res.data as RpSegment[]; write(list); return list; }
  } catch { /* fall through */ }
  write(read().filter((s) => s.id !== id));
  return loadSegments();
}

// ── Local-only fallback writers (offline / unauthenticated) ─────────────────
function saveLocal(name: string, filter: SegmentFilter): RpSegment[] {
  const clean = name.trim();
  if (!clean) return loadSegments();
  const list = read().filter((s) => s.name.toLowerCase() !== clean.toLowerCase());
  list.push({ id: `seg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: clean, filter, createdAt: Date.now() });
  write(list);
  return loadSegments();
}

/** True when the filter has at least one active predicate. */
export function isFilterActive(f: SegmentFilter): boolean {
  return !!(f.search || f.city || f.area || f.salesman || f.channel || f.class);
}

/** Apply a segment filter to a customer list. Shared by Customers + Day Planner. Pure. */
export function filterBySegment<T extends { name: string; code?: string | null; city?: string | null; area?: string | null; salesman?: string | null; channel?: string | null; class?: string | null }>(
  customers: readonly T[],
  f: SegmentFilter,
): T[] {
  const q = (f.search ?? '').trim().toLowerCase();
  return customers.filter((c) => {
    if (q && !(c.name.toLowerCase().includes(q) || (c.code ?? '').toLowerCase().includes(q))) return false;
    for (const k of ['city', 'area', 'salesman', 'channel', 'class'] as const) {
      if (f[k] && ((c[k] ?? '') as string).toString().trim() !== f[k]) return false;
    }
    return true;
  });
}
