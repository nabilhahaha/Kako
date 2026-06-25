// Route Planner — Mission EXECUTION export (pure, no I/O / no React).
//
// Builds the Excel sheet rows (arrays-of-arrays) for RP execution reporting (PR-7), reusing
// the shared buildXlsxWorkbook encoder. Kept pure so the column order + cell mapping are
// unit-tested and stable. Labels are injected (AR/EN) by the caller.

import type { TrackingRow } from './rp-mission-tracking';

/** A stop flattened with its mission + rep context for the stop-level export sheet. */
export interface ExportStop {
  missionName: string;
  assigneeName: string | null;
  seq: number;
  customerCode: string | null;
  customerName: string;
  status: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  notes: string | null;
}

export interface MissionExportLabels {
  mission: string; rep: string; date: string; status: string;
  stops: string; done: string; pending: string; completion: string;
  seq: string; code: string; customer: string; checkIn: string; checkOut: string; notes: string;
  unassigned: string;
}

function ts(s: string | null): string {
  return s ? new Date(s).toISOString().slice(0, 19).replace('T', ' ') : '';
}

/** Mission-level sheet rows: header + one row per mission. Pure. */
export function buildMissionsSheet(rows: readonly TrackingRow[], L: MissionExportLabels): (string | number)[][] {
  const header = [L.mission, L.rep, L.date, L.status, L.stops, L.done, L.pending, L.completion];
  const body = rows.map((r) => [
    r.name,
    r.assigneeName ?? L.unassigned,
    r.missionDate ? r.missionDate.slice(0, 10) : '',
    r.status,
    r.total,
    r.done,
    r.pending + r.checkedIn,
    `${r.pct}%`,
  ]);
  return [header, ...body];
}

/** Stop-level sheet rows: header + one row per stop. Pure. */
export function buildStopsSheet(stops: readonly ExportStop[], L: MissionExportLabels): (string | number)[][] {
  const header = [L.mission, L.rep, L.seq, L.code, L.customer, L.status, L.checkIn, L.checkOut, L.notes];
  const body = stops.map((s) => [
    s.missionName,
    s.assigneeName ?? L.unassigned,
    s.seq,
    s.customerCode ?? '',
    s.customerName,
    s.status,
    ts(s.checkInAt),
    ts(s.checkOutAt),
    s.notes ?? '',
  ]);
  return [header, ...body];
}
