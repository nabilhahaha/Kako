/**
 * COMMERCIAL DATA LAYER — shared parsing & validation service.
 *
 * One pipeline for every module: workbook → rows → header repair (verbatim
 * reference normalization, EN/AR variants + title-row skip) → frozen
 * RawParser (the audited ingestion codepath — never modified) → platform-
 * shaped invoices. Validation failures surface the file's actual headers,
 * exactly like the reference upload screen.
 *
 * The frozen modules under ../promotions/frozen are byte-identical extracts
 * of the reference implementation and act as the dashboard-wide canonical
 * ingestion code; this service is their single consumer-facing entry point.
 */
import { RawParser } from '../promotions/frozen/raw-parser.js';
import { repairHeaders } from '../promotions/frozen/header-repair.js';
import { invoicesFromParsed } from '../promotions/frozen/data-pool.js';

export interface ParsedUpload {
  /** platform-shaped invoices, ready for the shared pool */
  invoices: unknown[];
  /** raw parsed result from the frozen parser (lines + dimensions) */
  parsed: {
    lines: Array<Record<string, unknown>>;
    skus: Array<{ code: string; name: string }>;
    cities: string[];
    channels: string[];
    reps: string[];
    dateFrom: string;
    dateTo: string;
    nRows: number;
    nInv: number;
  };
  renamed: Array<{ from: string; to: string }>;
  headersFound: string[];
  freeValue: number;
}

/** Parse a 2-D row matrix (header row + data rows) through the shared
 * repair → frozen-parser pipeline. Throws Error with the reference
 * "Missing required columns: …" message on validation failure; the thrown
 * error carries `headersFound` for diagnostics. */
export function parseRows(matrix: unknown[][]): ParsedUpload {
  const { rows, renamed, headers } = repairHeaders(matrix) as {
    rows: unknown[][];
    renamed: Array<{ from: string; to: string }>;
    headers: string[];
  };
  try {
    const parsed = RawParser.parse(rows) as ParsedUpload['parsed'];
    const invoices = invoicesFromParsed(parsed) as unknown[];
    const freeValue = parsed.lines.reduce(
      (s, l) => s + (Number(l.net) === 0 ? Number(l.gross) || 0 : 0),
      0,
    );
    return { invoices, parsed, renamed, headersFound: headers, freeValue };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    (err as Error & { headersFound?: string[] }).headersFound = headers;
    throw err;
  }
}

/** Read an uploaded File (xlsx/xls/csv) into the 2-D row matrix the
 * pipeline expects. XLSX is loaded lazily to keep it out of entry chunks. */
export async function fileToMatrix(file: File): Promise<unknown[][]> {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' }) as unknown[][];
}
