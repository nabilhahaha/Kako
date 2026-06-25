// Route Planner — Mission TRACKING model (pure, no I/O / no React).
//
// Supervisor/admin oversight (PR-6) over the canonical RP Missions path. Pure rollups so the
// KPI summary and per-rep aggregation are unit-tested and identical on client + server.

import type { MissionStatus } from '@/lib/erp/route-planner-mission';
import type { StatusTone } from './rp-mission-exec';
import { missionTone } from './rp-mission-exec';

export type { StatusTone };
export { missionTone };

/** One mission as the tracking table sees it (progress pre-computed server-side). */
export interface TrackingRow {
  id: string;
  name: string;
  missionDate: string | null;
  status: MissionStatus;
  assigneeId: string | null;
  assigneeName: string | null;
  total: number;
  done: number;
  skipped: number;
  pending: number;
  checkedIn: number;
  pct: number;
}

export interface TrackingSummary {
  missions: number;
  activeMissions: number;     // in_progress
  completedMissions: number;  // completed or reviewed
  totalStops: number;
  doneStops: number;
  pendingStops: number;       // pending + checked_in (not finished)
  pct: number;                // done / total stops
}

/** Company/team KPI summary across the visible missions. Pure. */
export function trackingSummary(rows: readonly TrackingRow[]): TrackingSummary {
  let totalStops = 0, doneStops = 0, pendingStops = 0, active = 0, completed = 0;
  for (const r of rows) {
    totalStops += r.total;
    doneStops += r.done;
    pendingStops += r.pending + r.checkedIn;
    if (r.status === 'in_progress') active++;
    if (r.status === 'completed' || r.status === 'reviewed') completed++;
  }
  return {
    missions: rows.length,
    activeMissions: active,
    completedMissions: completed,
    totalStops,
    doneStops,
    pendingStops,
    pct: totalStops ? Math.round((doneStops / totalStops) * 100) : 0,
  };
}

export interface RepRollup {
  assigneeId: string | null;
  name: string;
  missions: number;
  totalStops: number;
  doneStops: number;
  pct: number;
}

/** Aggregate the visible missions by assigned rep (unassigned grouped under a null id). Pure. */
export function repRollup(rows: readonly TrackingRow[]): RepRollup[] {
  const by = new Map<string, RepRollup>();
  for (const r of rows) {
    const key = r.assigneeId ?? '∅';
    const cur = by.get(key) ?? { assigneeId: r.assigneeId, name: r.assigneeName ?? '—', missions: 0, totalStops: 0, doneStops: 0, pct: 0 };
    cur.missions += 1;
    cur.totalStops += r.total;
    cur.doneStops += r.done;
    by.set(key, cur);
  }
  return [...by.values()]
    .map((x) => ({ ...x, pct: x.totalStops ? Math.round((x.doneStops / x.totalStops) * 100) : 0 }))
    .sort((a, b) => b.totalStops - a.totalStops);
}
