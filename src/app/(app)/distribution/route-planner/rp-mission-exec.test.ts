import { describe, it, expect } from 'vitest';
import {
  orderedStops, nextActionableStop, runProgress, allStopsHandled, stopHasCoords,
  stopsToMapPoints, stopTone, missionTone, type MissionRunStop,
} from './rp-mission-exec';

const stop = (over: Partial<MissionRunStop> = {}): MissionRunStop => ({
  id: 'a', seq: 1, customerCode: 'C1', customerName: 'Cust 1',
  lat: 24.7, lng: 46.7, status: 'pending', checkInAt: null, checkOutAt: null, notes: null, ...over,
});

describe('rp-mission-exec — pure execution model', () => {
  it('orders stops by seq then id, without mutating input', () => {
    const input = [stop({ id: 'b', seq: 2 }), stop({ id: 'a', seq: 1 })];
    const out = orderedStops(input);
    expect(out.map((s) => s.id)).toEqual(['a', 'b']);
    expect(input.map((s) => s.id)).toEqual(['b', 'a']); // original untouched
  });

  it('nextActionableStop prefers a checked_in stop, then the first pending', () => {
    const stops = [
      stop({ id: '1', seq: 1, status: 'done' }),
      stop({ id: '2', seq: 2, status: 'pending' }),
      stop({ id: '3', seq: 3, status: 'checked_in' }),
    ];
    expect(nextActionableStop(stops)?.id).toBe('3'); // mid-visit wins
    expect(nextActionableStop([stop({ id: '1', status: 'done' }), stop({ id: '2', seq: 2, status: 'pending' })])?.id).toBe('2');
    expect(nextActionableStop([stop({ status: 'done' })])).toBeNull();
  });

  it('runProgress counts done/skipped/checked_in/pending and pct', () => {
    const p = runProgress([
      stop({ status: 'done' }), stop({ status: 'done' }), stop({ status: 'skipped' }),
      stop({ status: 'checked_in' }), stop({ status: 'pending' }),
    ]);
    expect(p.total).toBe(5);
    expect(p.done).toBe(2);
    expect(p.skipped).toBe(1);
    expect(p.checkedIn).toBe(1);
    expect(p.pending).toBe(1);
    expect(p.visited).toBe(3); // done + skipped
    expect(p.pct).toBe(60);
  });

  it('allStopsHandled is true only when every stop is done or skipped', () => {
    expect(allStopsHandled([stop({ status: 'done' }), stop({ status: 'skipped' })])).toBe(true);
    expect(allStopsHandled([stop({ status: 'done' }), stop({ status: 'pending' })])).toBe(false);
    expect(allStopsHandled([])).toBe(false);
  });

  it('stopHasCoords rejects null and 0,0', () => {
    expect(stopHasCoords({ lat: 24.7, lng: 46.7 })).toBe(true);
    expect(stopHasCoords({ lat: null, lng: 46.7 })).toBe(false);
    expect(stopHasCoords({ lat: 0, lng: 0 })).toBe(false);
  });

  it('stopsToMapPoints drops invalid coords and marks done=green(completed)', () => {
    const pts = stopsToMapPoints([
      stop({ id: '1', status: 'done' }),
      stop({ id: '2', status: 'pending' }),
      stop({ id: '3', lat: null, lng: null }),
    ]);
    expect(pts.map((p) => p.id)).toEqual(['1', '2']); // invalid dropped
    expect(pts.find((p) => p.id === '1')?.completed).toBe(true);
    expect(pts.find((p) => p.id === '2')?.completed).toBe(false);
  });

  it('status tones follow the approved colour language', () => {
    expect(stopTone('done')).toBe('green');
    expect(stopTone('checked_in')).toBe('blue');
    expect(stopTone('pending')).toBe('amber');
    expect(stopTone('skipped')).toBe('red');
    expect(missionTone('in_progress')).toBe('blue');
    expect(missionTone('completed')).toBe('green');
    expect(missionTone('assigned')).toBe('amber');
  });
});
