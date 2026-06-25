// Route Planner — Mission BUILD model (pure, no I/O / no React).
//
// The admin/planner side of the canonical RP Missions path (PR-5): pick customers from a
// saved dataset, order them into stops, name the plan, and assign it to a rep. Kept pure so
// selection-ordering, validation and the map preview are unit-tested and identical on
// client + server.

import type { FvMapPoint } from './fv-map-helpers';

/** A candidate customer for a plan (mapped from erp_rp_dataset_customers). */
export interface PlanCustomer {
  id: string;
  code: string | null;
  name: string;
  lat: number | null;
  lng: number | null;
  city: string | null;
  channel: string | null;
  salesman: string | null;
}

/** Validate a plan before save. Returns an error key, or null when valid. Pure. */
export function validateMissionPlan(input: { name: string; selectedIds: readonly string[] }): string | null {
  if (!input.name.trim()) return 'err_name_required';
  if (input.selectedIds.length === 0) return 'err_no_stops';
  return null;
}

/** Resolve the selected customers in the chosen ORDER (selectedIds is authoritative for
 *  sequence). Unknown ids are dropped; duplicates collapse to first occurrence. Pure. */
export function selectedInOrder(all: readonly PlanCustomer[], selectedIds: readonly string[]): PlanCustomer[] {
  const byId = new Map(all.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const out: PlanCustomer[] = [];
  for (const id of selectedIds) {
    if (seen.has(id)) continue;
    const c = byId.get(id);
    if (c) { out.push(c); seen.add(id); }
  }
  return out;
}

/** Move an id one position up/down within an ordered selection (immutable). Pure. */
export function moveSelected(selectedIds: readonly string[], id: string, dir: -1 | 1): string[] {
  const arr = [...selectedIds];
  const i = arr.indexOf(id);
  if (i < 0) return arr;
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  return arr;
}

/** Toggle an id in the selection, preserving order (append on select). Pure. */
export function toggleSelected(selectedIds: readonly string[], id: string): string[] {
  return selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id];
}

/** The stop rows to persist, in sequence (1-based seq). Pure. */
export function planToStops(ordered: readonly PlanCustomer[]): { seq: number; customer: PlanCustomer }[] {
  return ordered.map((customer, i) => ({ seq: i + 1, customer }));
}

/** Map plan customers → FvMap points for the builder preview (all "pending" = red). */
export function planToMapPoints(ordered: readonly PlanCustomer[]): FvMapPoint[] {
  return ordered
    .filter((c) => typeof c.lat === 'number' && typeof c.lng === 'number' && !(c.lat === 0 && c.lng === 0))
    .map((c) => ({
      id: c.id, code: c.code, name: c.name, lat: c.lat as number, lng: c.lng as number,
      city: c.city, channel: c.channel, completed: false, lastVerifiedAt: null,
    }));
}
