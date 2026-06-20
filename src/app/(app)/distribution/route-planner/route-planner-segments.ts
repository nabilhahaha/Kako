// ============================================================================
// Saved Customer Segments — a named, reusable filter over the loaded customers
// (e.g. "Jeddah VIP A-class"). Used by the Customers screen and, later, as a
// Day Planner "Saved Segment" planning source. Small data -> localStorage.
//
// Standalone / session-friendly: segments store the FILTER, not the customer rows,
// so they apply to whatever dataset is loaded. Browser-only.
// ============================================================================

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

export function loadSegments(): RpSegment[] {
  return read().sort((a, b) => b.createdAt - a.createdAt);
}

/** Save (or replace by exact name) a named segment. */
export function saveSegment(name: string, filter: SegmentFilter): RpSegment[] {
  const clean = name.trim();
  if (!clean) return loadSegments();
  const list = read().filter((s) => s.name.toLowerCase() !== clean.toLowerCase());
  list.push({ id: `seg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: clean, filter, createdAt: Date.now() });
  write(list);
  return loadSegments();
}

export function deleteSegment(id: string): RpSegment[] {
  write(read().filter((s) => s.id !== id));
  return loadSegments();
}

/** True when the filter has at least one active predicate. */
export function isFilterActive(f: SegmentFilter): boolean {
  return !!(f.search || f.city || f.area || f.salesman || f.channel || f.class);
}
