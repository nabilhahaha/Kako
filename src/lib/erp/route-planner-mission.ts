// ============================================================================
// Supervisor Missions — pure lifecycle + report engine (no I/O). Shared by the mission
// server actions and the UI. Keeps status transitions, progress, and the auto-generated
// mission report testable and identical everywhere.
// ============================================================================

export const MISSION_STATUSES = ['draft', 'assigned', 'in_progress', 'completed', 'reviewed', 'archived'] as const;
export type MissionStatus = (typeof MISSION_STATUSES)[number];

export const STOP_STATUSES = ['pending', 'checked_in', 'done', 'skipped'] as const;
export type StopStatus = (typeof STOP_STATUSES)[number];

export const MISSION_EVENT_KINDS = ['start', 'pause', 'resume', 'complete', 'check_in', 'check_out', 'note', 'photo', 'issue', 'competitor', 'opportunity', 'follow_up'] as const;
export type MissionEventKind = (typeof MISSION_EVENT_KINDS)[number];

/** Allowed forward/abort transitions. Drives both the action guard and the UI buttons. */
export const MISSION_FLOW: Record<MissionStatus, MissionStatus[]> = {
  draft:       ['assigned', 'archived'],
  assigned:    ['in_progress', 'draft', 'archived'],
  in_progress: ['completed', 'archived'],
  completed:   ['reviewed', 'archived'],
  reviewed:    ['archived'],
  archived:    [],
};

export function canTransition(from: MissionStatus, to: MissionStatus): boolean {
  return MISSION_FLOW[from]?.includes(to) ?? false;
}

/** Which mission_perms capability a transition requires (null = author/assignee/admin only). */
export function transitionCapability(to: MissionStatus): 'assign' | 'review' | null {
  if (to === 'assigned') return 'assign';
  if (to === 'reviewed') return 'review';
  return null;
}

export interface StopLike { status: string }

export interface MissionProgress { total: number; done: number; skipped: number; checkedIn: number; pending: number; visited: number; pct: number }

/** Visit progress over a mission's stops. `visited` = done + skipped (a stop was handled). */
export function missionProgress(stops: readonly StopLike[]): MissionProgress {
  const total = stops.length;
  let done = 0, skipped = 0, checkedIn = 0;
  for (const s of stops) {
    if (s.status === 'done') done++;
    else if (s.status === 'skipped') skipped++;
    else if (s.status === 'checked_in') checkedIn++;
  }
  const visited = done + skipped;
  const pending = total - visited - checkedIn;
  return { total, done, skipped, checkedIn, pending, visited, pct: total ? Math.round((visited / total) * 100) : 0 };
}

export interface EventLike { kind: string }

export interface MissionReport {
  stopsPlanned: number;
  stopsCompleted: number;
  stopsSkipped: number;
  stopsMissed: number;     // never reached (pending at completion)
  issues: number;
  competitors: number;
  opportunities: number;
  followUps: number;
  photos: number;
  notes: number;
}

/** Auto-generated mission report from stops + the activity log. Pure. */
export function missionReport(stops: readonly StopLike[], events: readonly EventLike[]): MissionReport {
  const p = missionProgress(stops);
  const count = (k: string) => events.reduce((n, e) => n + (e.kind === k ? 1 : 0), 0);
  return {
    stopsPlanned: p.total,
    stopsCompleted: p.done,
    stopsSkipped: p.skipped,
    stopsMissed: p.pending + p.checkedIn,   // not completed at report time
    issues: count('issue'),
    competitors: count('competitor'),
    opportunities: count('opportunity'),
    followUps: count('follow_up'),
    photos: count('photo'),
    notes: count('note'),
  };
}

/** The observation kinds a supervisor can log at a stop (subset of events). */
export const STOP_OBSERVATION_KINDS = ['note', 'photo', 'issue', 'competitor', 'opportunity', 'follow_up'] as const;
export type StopObservationKind = (typeof STOP_OBSERVATION_KINDS)[number];
