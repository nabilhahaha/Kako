import { describe, it, expect } from 'vitest';
import {
  canTransition, transitionCapability, missionProgress, missionReport,
  MISSION_FLOW, MISSION_STATUSES, STOP_OBSERVATION_KINDS,
} from './route-planner-mission';

describe('mission lifecycle transitions', () => {
  it('follows draft → assigned → in_progress → completed → reviewed → archived', () => {
    expect(canTransition('draft', 'assigned')).toBe(true);
    expect(canTransition('assigned', 'in_progress')).toBe(true);
    expect(canTransition('in_progress', 'completed')).toBe(true);
    expect(canTransition('completed', 'reviewed')).toBe(true);
    expect(canTransition('reviewed', 'archived')).toBe(true);
  });

  it('rejects illegal jumps', () => {
    expect(canTransition('draft', 'completed')).toBe(false);
    expect(canTransition('assigned', 'reviewed')).toBe(false);
    expect(canTransition('archived', 'draft')).toBe(false);
    expect(canTransition('completed', 'in_progress')).toBe(false);
  });

  it('allows abort-to-archive from any non-terminal state', () => {
    for (const s of MISSION_STATUSES) {
      if (s !== 'archived') expect(MISSION_FLOW[s]).toContain('archived');
    }
  });

  it('maps transitions to the required capability', () => {
    expect(transitionCapability('assigned')).toBe('assign');
    expect(transitionCapability('reviewed')).toBe('review');
    expect(transitionCapability('in_progress')).toBeNull();
    expect(transitionCapability('completed')).toBeNull();
  });
});

describe('mission progress', () => {
  it('counts done/skipped/checked-in/pending and percent visited', () => {
    const stops = [
      { status: 'done' }, { status: 'done' }, { status: 'skipped' },
      { status: 'checked_in' }, { status: 'pending' },
    ];
    const p = missionProgress(stops);
    expect(p).toMatchObject({ total: 5, done: 2, skipped: 1, checkedIn: 1, pending: 1, visited: 3 });
    expect(p.pct).toBe(60);   // 3 of 5 handled
  });

  it('is empty-safe', () => {
    expect(missionProgress([]).pct).toBe(0);
  });
});

describe('mission report', () => {
  it('summarises stops + observation events', () => {
    const stops = [{ status: 'done' }, { status: 'done' }, { status: 'skipped' }, { status: 'pending' }];
    const events = [
      { kind: 'start' }, { kind: 'check_in' }, { kind: 'note' }, { kind: 'photo' }, { kind: 'photo' },
      { kind: 'issue' }, { kind: 'competitor' }, { kind: 'opportunity' }, { kind: 'opportunity' }, { kind: 'follow_up' },
    ];
    const r = missionReport(stops, events);
    expect(r).toMatchObject({
      stopsPlanned: 4, stopsCompleted: 2, stopsSkipped: 1, stopsMissed: 1,
      issues: 1, competitors: 1, opportunities: 2, followUps: 1, photos: 2, notes: 1,
    });
  });

  it('observation kinds are a subset of the event kinds', () => {
    expect(STOP_OBSERVATION_KINDS).toContain('issue');
    expect(STOP_OBSERVATION_KINDS).toContain('opportunity');
    expect(STOP_OBSERVATION_KINDS).not.toContain('start');
  });
});
