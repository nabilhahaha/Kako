import { describe, it, expect } from 'vitest';
import { buildMissionsSheet, buildStopsSheet, type ExportStop, type MissionExportLabels } from './rp-mission-export';
import type { TrackingRow } from './rp-mission-tracking';

const L: MissionExportLabels = {
  mission: 'Mission', rep: 'Rep', date: 'Date', status: 'Status', stops: 'Stops', done: 'Done',
  pending: 'Pending', completion: 'Completion', seq: 'Seq', code: 'Code', customer: 'Customer',
  checkIn: 'Check-in', checkOut: 'Check-out', notes: 'Notes', unassigned: 'Unassigned',
};

const m = (over: Partial<TrackingRow> = {}): TrackingRow => ({
  id: 'm', name: 'Route A', missionDate: '2026-06-25', status: 'in_progress',
  assigneeId: 'u', assigneeName: 'Rep One', total: 10, done: 4, skipped: 1, pending: 4, checkedIn: 1, pct: 40, ...over,
});

describe('rp-mission-export — sheet builders', () => {
  it('missions sheet: header + computed pending (pending+checkedIn) + pct%', () => {
    const aoa = buildMissionsSheet([m()], L);
    expect(aoa[0]).toEqual(['Mission', 'Rep', 'Date', 'Status', 'Stops', 'Done', 'Pending', 'Completion']);
    expect(aoa[1]).toEqual(['Route A', 'Rep One', '2026-06-25', 'in_progress', 10, 4, 5, '40%']);
  });

  it('missions sheet: unassigned label when no rep', () => {
    const aoa = buildMissionsSheet([m({ assigneeName: null, assigneeId: null })], L);
    expect(aoa[1][1]).toBe('Unassigned');
  });

  it('stops sheet: header + formatted timestamps + blanks for nulls', () => {
    const stops: ExportStop[] = [{
      missionName: 'Route A', assigneeName: 'Rep One', seq: 1, customerCode: 'C1', customerName: 'Cust',
      status: 'done', checkInAt: '2026-06-25T08:30:00.000Z', checkOutAt: null, notes: null,
    }];
    const aoa = buildStopsSheet(stops, L);
    expect(aoa[0][0]).toBe('Mission');
    expect(aoa[1]).toEqual(['Route A', 'Rep One', 1, 'C1', 'Cust', 'done', '2026-06-25 08:30:00', '', '']);
  });
});
