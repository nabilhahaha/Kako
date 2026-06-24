// ============================================================================
// Multi-Form Field Work — export shaping (pure, no I/O / no React).
//
// Turns form submissions into a flat { columns, rows } table for the .xlsx writer. A
// per-form export carries the COMMON columns + one DYNAMIC column per includeInReport field
// (rendered via answerText); a cross-form export carries the common columns only. Headers are
// passed in already-localized so this stays pure + unit-tested.
// ============================================================================

import { reportFields, answerText, fieldLabel, type FormSchema } from './form-schema';

export type ExportCell = string | number;
export interface ExportTable { columns: string[]; rows: ExportCell[][] }

/** Localized labels for the common columns (shared by per-form + cross-form exports). */
export interface CommonHeaders {
  formName: string; version: string; submissionId: string;
  customerCode: string; customerName: string; rep: string;
  datetime: string; status: string; gpsLat: string; gpsLng: string; photos: string;
}

/** Minimal submission shape the exporter needs (maps from FormSubmissionRow / CrossRow). */
export interface ExportSubmission {
  id: string;
  version: number;
  formName?: string;
  recordCode: string | null;
  recordName: string | null;
  repName: string | null;
  createdAt: string;
  status: string | null;
  gpsLat: number | null;
  gpsLng: number | null;
  photoCount: number;
  answers?: Record<string, unknown>;
}

function isoCell(iso: string): string {
  // stable, sortable YYYY-MM-DD HH:MM:SS
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 19).replace('T', ' ');
}

function commonValues(s: ExportSubmission, formName: string): ExportCell[] {
  return [
    s.formName ?? formName,
    s.version,
    s.id,
    s.recordCode ?? '',
    s.recordName ?? '',
    s.repName ?? '',
    isoCell(s.createdAt),
    s.status ?? '',
    s.gpsLat ?? '',
    s.gpsLng ?? '',
    s.photoCount,
  ];
}

function commonColumns(h: CommonHeaders): string[] {
  return [h.formName, h.version, h.submissionId, h.customerCode, h.customerName, h.rep, h.datetime, h.status, h.gpsLat, h.gpsLng, h.photos];
}

/** Per-form export: common columns + a dynamic column per includeInReport field. */
export function buildFormExportRows(
  schema: FormSchema,
  submissions: ExportSubmission[],
  opts: { lang: 'ar' | 'en'; common: CommonHeaders; formName: string; yes: string; no: string },
): ExportTable {
  const fields = reportFields(schema);
  const columns = [...commonColumns(opts.common), ...fields.map((f) => fieldLabel(f, opts.lang))];
  const rows = submissions.map((s) => [
    ...commonValues(s, opts.formName),
    ...fields.map((f) => answerText(f, s.answers?.[f.id], opts.lang, opts.yes, opts.no)),
  ]);
  return { columns, rows };
}

/** Cross-form export: common columns only (forms have different field sets). */
export function buildCrossExportRows(
  submissions: ExportSubmission[],
  opts: { common: CommonHeaders },
): ExportTable {
  const columns = commonColumns(opts.common);
  const rows = submissions.map((s) => commonValues(s, s.formName ?? ''));
  return { columns, rows };
}
