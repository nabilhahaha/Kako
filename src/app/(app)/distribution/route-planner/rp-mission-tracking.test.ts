import { describe, it, expect } from 'vitest';
import { trackingSummary, repRollup, type TrackingRow } from './rp-mission-tracking';

const row = (over: Partial<TrackingRow> = {}): TrackingRow => ({
  id: 'm1', name: 'Mission', missionDate: null, status: 'in_progress',
  assigneeId: 'u1', assigneeName: 'Rep One',
  total: 10, done: 4, skipped: 1, pending: 4, checkedIn: 1, pct: 40, ...over,
});

describe('rp-mission-tracking — pure rollups', () => {
  it('summary totals stops, pending = pending + checkedIn, and pct = done/total', () => {
    const s = trackingSummary([
      row({ total: 10, done: 4, pending: 4, checkedIn: 1, skipped: 1, status: 'in_progress' }),
      row({ id: 'm2', total: 6, done: 6, pending: 0, checkedIn: 0, skipped: 0, status: 'completed' }),
    ]);
    expect(s.missions).toBe(2);
    expect(s.activeMissions).toBe(1);
    expect(s.completedMissions).toBe(1);
    expect(s.totalStops).toBe(16);
    expect(s.doneStops).toBe(10);
    expect(s.pendingStops).toBe(5); // (4+1) + 0
    expect(s.pct).toBe(63); // 10/16
  });

  it('summary is zero-safe for no missions', () => {
    expect(trackingSummary([])).toMatchObject({ missions: 0, totalStops: 0, pct: 0 });
  });

  it('repRollup groups by assignee, sorts by total stops desc, computes pct', () => {
    const rows = [
      row({ assigneeId: 'u1', assigneeName: 'A', total: 5, done: 5 }),
      row({ id: 'm2', assigneeId: 'u1', assigneeName: 'A', total: 5, done: 0 }),
      row({ id: 'm3', assigneeId: 'u2', assigneeName: 'B', total: 4, done: 2 }),
    ];
    const r = repRollup(rows);
    expect(r).toHaveLength(2);
    expect(r[0].name).toBe('A'); // 10 stops > 4 stops
    expect(r[0].missions).toBe(2);
    expect(r[0].doneStops).toBe(5);
    expect(r[0].pct).toBe(50);
    expect(r[1].name).toBe('B');
    expect(r[1].pct).toBe(50);
  });

  it('groups unassigned missions under a null id', () => {
    const r = repRollup([row({ assigneeId: null, assigneeName: null, total: 3, done: 0 })]);
    expect(r[0].assigneeId).toBeNull();
    expect(r[0].name).toBe('—');
  });
});
