// ============================================================================
// Planner KPIs — pure aggregation (no I/O). PLANNER-ONLY metrics: visits, missions,
// plans, observations. NO sales / revenue / collections / credit / invoice / stock /
// accounting metrics — those are deliberately out of scope. Shared by the dashboards.
// ============================================================================
import type { MissionStatus } from './route-planner-mission';

export interface MissionLite {
  status: MissionStatus;
  missionDate: string | null;   // 'YYYY-MM-DD'
  stopCount: number;
  assignedTo: string | null;
  createdBy: string;
}

export interface MissionKpis {
  total: number;
  draft: number;
  assigned: number;
  inProgress: number;
  completed: number;
  reviewed: number;
  archived: number;
  /** Dated before today and not yet completed/reviewed/archived. */
  overdue: number;
  /** Dated today. */
  today: number;
  /** Visits planned across live missions (assigned + in progress + completed + reviewed). */
  plannedVisits: number;
  /** Completed missions awaiting a review sign-off. */
  pendingReports: number;
  active: number;             // assigned + in_progress
}

const LIVE: MissionStatus[] = ['assigned', 'in_progress', 'completed', 'reviewed'];
const OPEN: MissionStatus[] = ['draft', 'assigned', 'in_progress'];

/** Mission-level KPIs from a list of mission headers, relative to `todayISO` (YYYY-MM-DD). */
export function computeMissionKpis(missions: readonly MissionLite[], todayISO: string): MissionKpis {
  const k: MissionKpis = {
    total: missions.length, draft: 0, assigned: 0, inProgress: 0, completed: 0, reviewed: 0, archived: 0,
    overdue: 0, today: 0, plannedVisits: 0, pendingReports: 0, active: 0,
  };
  for (const m of missions) {
    switch (m.status) {
      case 'draft': k.draft++; break;
      case 'assigned': k.assigned++; break;
      case 'in_progress': k.inProgress++; break;
      case 'completed': k.completed++; break;
      case 'reviewed': k.reviewed++; break;
      case 'archived': k.archived++; break;
    }
    if (LIVE.includes(m.status)) k.plannedVisits += m.stopCount || 0;
    if (m.status === 'completed') k.pendingReports++;
    if (m.missionDate) {
      if (m.missionDate === todayISO) k.today++;
      else if (m.missionDate < todayISO && OPEN.includes(m.status)) k.overdue++;
    }
  }
  k.active = k.assigned + k.inProgress;
  return k;
}

/** Visit + observation KPIs (filled from DB aggregates: stop statuses + event kinds). */
export interface VisitKpis {
  completedVisits: number;   // stops done
  missedVisits: number;      // stops skipped + pending on completed missions
  stopsWithIssues: number;
  stopsWithOpportunities: number;
  followUps: number;
}

export interface PlannerKpis extends MissionKpis, VisitKpis {}

export function mergeKpis(m: MissionKpis, v: VisitKpis): PlannerKpis {
  return { ...m, ...v };
}

/** Group missions into Today / Upcoming / Overdue / Done buckets (My Missions view). */
export interface MissionBuckets<T> { today: T[]; upcoming: T[]; overdue: T[]; done: T[] }
export function bucketMissions<T extends { status: MissionStatus; missionDate: string | null }>(missions: readonly T[], todayISO: string): MissionBuckets<T> {
  const b: MissionBuckets<T> = { today: [], upcoming: [], overdue: [], done: [] };
  for (const m of missions) {
    if (m.status === 'completed' || m.status === 'reviewed' || m.status === 'archived') { b.done.push(m); continue; }
    if (!m.missionDate) { b.upcoming.push(m); continue; }
    if (m.missionDate === todayISO) b.today.push(m);
    else if (m.missionDate < todayISO) b.overdue.push(m);
    else b.upcoming.push(m);
  }
  return b;
}
