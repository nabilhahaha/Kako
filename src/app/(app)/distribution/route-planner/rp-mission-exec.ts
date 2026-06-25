// Route Planner — Mission EXECUTION model (pure, no I/O / no React).
//
// The rep-mobile execution layer (PR-4) on top of the canonical RP Missions stack
// (erp_rp_missions → erp_rp_mission_stops → erp_rp_mission_events). Kept pure so stop
// ordering, the "next actionable stop", progress, and status→colour mapping are
// unit-tested and identical on client + server. Reuses missionProgress() from the shared
// mission engine; adds only the execution-specific helpers.

import { missionProgress, type StopStatus, type MissionStatus } from '@/lib/erp/route-planner-mission';
import type { FvMapPoint } from './fv-map-helpers';

export type { StopStatus, MissionStatus };

/** One stop in a mission run (mapped from erp_rp_mission_stops). */
export interface MissionRunStop {
  id: string;
  seq: number;
  customerCode: string | null;
  customerName: string;
  lat: number | null;
  lng: number | null;
  status: StopStatus;
  checkInAt: string | null;
  checkOutAt: string | null;
  notes: string | null;
}

/** A mission as the rep sees it in the list (header + computed progress). */
export interface MissionRunRow {
  id: string;
  name: string;
  missionDate: string | null;
  status: MissionStatus;
  stopCount: number;
  doneCount: number;
  pct: number;
}

/** UX status tokens — green = completed, blue = active/in-progress, amber = pending/upcoming,
 *  red = issue/missed (skipped). Mirrors the approved Route Planner colour language. */
export type StatusTone = 'green' | 'blue' | 'amber' | 'red' | 'slate';

export const STOP_TONE: Record<StopStatus, StatusTone> = {
  done: 'green',
  checked_in: 'blue',
  pending: 'amber',
  skipped: 'red',
};

export const MISSION_TONE: Record<MissionStatus, StatusTone> = {
  draft: 'slate',
  assigned: 'amber',
  in_progress: 'blue',
  completed: 'green',
  reviewed: 'green',
  archived: 'slate',
};

export function stopTone(status: StopStatus): StatusTone {
  return STOP_TONE[status] ?? 'slate';
}
export function missionTone(status: MissionStatus): StatusTone {
  return MISSION_TONE[status] ?? 'slate';
}

/** Stops in visiting order (seq asc, stable on id). Pure; never mutates the input. */
export function orderedStops(stops: readonly MissionRunStop[]): MissionRunStop[] {
  return [...stops].sort((a, b) => (a.seq - b.seq) || a.id.localeCompare(b.id));
}

/**
 * The next stop the rep should act on: the first not-yet-handled stop in visiting order —
 * a `checked_in` stop (mid-visit) wins over `pending`; `done`/`skipped` are finished.
 * Returns null when every stop is handled. Pure.
 */
export function nextActionableStop(stops: readonly MissionRunStop[]): MissionRunStop | null {
  const ordered = orderedStops(stops);
  return ordered.find((s) => s.status === 'checked_in')
      ?? ordered.find((s) => s.status === 'pending')
      ?? null;
}

/** Whole-mission progress (reuses the shared engine). Accepts anything with a `status`
 *  (full stops or lightweight {status} rows used by the list view). */
export function runProgress(stops: readonly { status: string }[]) {
  return missionProgress(stops);
}

/** True when every stop has been handled (done or skipped) → the mission can be completed. */
export function allStopsHandled(stops: readonly MissionRunStop[]): boolean {
  return stops.length > 0 && stops.every((s) => s.status === 'done' || s.status === 'skipped');
}

/** A stop has usable coordinates for the map / navigation. */
export function stopHasCoords(s: { lat: number | null; lng: number | null }): boolean {
  return typeof s.lat === 'number' && typeof s.lng === 'number' && !(s.lat === 0 && s.lng === 0);
}

/** Map mission stops → FvMap points so the rep map reuses the existing MapLibre component.
 *  done → green ("completed"); everything else → red (pending), matching FvMap's legend. */
export function stopsToMapPoints(stops: readonly MissionRunStop[]): FvMapPoint[] {
  return orderedStops(stops)
    .filter(stopHasCoords)
    .map((s) => ({
      id: s.id,
      code: s.customerCode,
      name: s.customerName,
      lat: s.lat as number,
      lng: s.lng as number,
      city: null,
      channel: null,
      completed: s.status === 'done',
      lastVerifiedAt: s.checkOutAt,
    }));
}
