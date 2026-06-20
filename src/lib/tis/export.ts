/**
 * TIS export/import — single data model (RO-3). Pure, no I/O. Serializes a
 * TisDataset to CSV using the SAME column schema the upload adapter reads
 * (`TisUploadRow`), so an exported file re-imports via `buildTisDatasetFromRows`
 * with no transformation, validation issues, or field remapping (strategy §4a).
 * This is the L1 interchange for Excel · Google Sheets · SalesBuzz/Mira/Mirna ·
 * VANTORA apply.
 */
import { formatFrequency } from '@/lib/route-optimization/visit-frequency';
import type { TisCustomer, TisDataset } from './dataset';
import type { TisUploadRow } from './upload';

/** Canonical single-model column order (matches TisUploadRow keys). */
export const TIS_CSV_COLUMNS = [
  'id', 'code', 'name', 'lat', 'lng',
  'salesmanId', 'supervisorId', 'areaId', 'regionId', 'routeId',
  'grade', 'frequency', 'salesValue', 'coverage', 'health',
] as const;

function csvCell(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function customerRow(c: TisCustomer): Record<(typeof TIS_CSV_COLUMNS)[number], unknown> {
  return {
    id: c.id, code: c.code, name: c.name,
    lat: c.geo?.lat ?? '', lng: c.geo?.lng ?? '',
    salesmanId: c.ownership.salesmanId, supervisorId: c.ownership.supervisorId,
    areaId: c.ownership.areaId, regionId: c.ownership.regionId, routeId: c.ownership.routeId,
    grade: c.grade, frequency: c.frequency ? formatFrequency(c.frequency) : '',
    salesValue: c.salesValue ?? '', coverage: c.coverage, health: c.health ?? '',
  };
}

/** Serialize a dataset to single-model CSV. Pure. */
export function datasetToCsv(dataset: TisDataset): string {
  const header = TIS_CSV_COLUMNS.join(',');
  const lines = dataset.customers.map((c) => {
    const row = customerRow(c);
    return TIS_CSV_COLUMNS.map((k) => csvCell(row[k])).join(',');
  });
  return [header, ...lines].join('\n');
}

/** Parse a single line of CSV into cells (RFC-4180-ish: quotes + escaped quotes). */
function parseLine(line: string): string[] {
  const out: string[] = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * Parse single-model CSV back into upload rows (header-driven; tolerant of column
 * reordering and extra columns). Pure — feed into `buildTisDatasetFromRows`.
 */
export function csvToRows(csv: string): TisUploadRow[] {
  const lines = csv.replace(/\r\n/g, '\n').split('\n').filter((l) => l.length > 0);
  if (lines.length < 2) return [];
  const header = parseLine(lines[0]).map((h) => h.trim());
  const idx = (k: string) => header.indexOf(k);
  const get = (cells: string[], k: string) => { const i = idx(k); return i >= 0 ? (cells[i] ?? '') : ''; };
  return lines.slice(1).map((line) => {
    const c = parseLine(line);
    return {
      id: get(c, 'id') || null,
      code: get(c, 'code') || null,
      name: get(c, 'name') || null,
      lat: get(c, 'lat') || null,
      lng: get(c, 'lng') || null,
      salesmanId: get(c, 'salesmanId') || null,
      supervisorId: get(c, 'supervisorId') || null,
      areaId: get(c, 'areaId') || null,
      regionId: get(c, 'regionId') || null,
      routeId: get(c, 'routeId') || null,
      grade: get(c, 'grade') || null,
      frequency: get(c, 'frequency') || null,
      salesValue: get(c, 'salesValue') || null,
      coverage: get(c, 'coverage') || null,
      health: get(c, 'health') || null,
    } satisfies TisUploadRow;
  });
}
