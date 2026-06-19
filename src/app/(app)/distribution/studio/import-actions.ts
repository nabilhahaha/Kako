'use server';

import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { parseXlsxBuffer } from '@/lib/erp/xlsx-read';
import { parseCsv, parseJson } from '@/lib/erp/import-parse';
import { mapRecordsToUploadRows, type TisUploadRow } from '@/lib/tis/upload';

export type ParseUploadResult =
  | { ok: true; rows: TisUploadRow[]; total: number; mapped: number; columns: string[] }
  | { ok: false; error: string };

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

/**
 * Parse an uploaded dataset file (CSV / XLSX / JSON) into canonical TIS upload
 * rows on the server — reusing the dependency-free xlsx + CSV/JSON parsers and the
 * tolerant header mapper. The client then builds the working dataset from the rows
 * (no live-tenant write — this only feeds the in-session Studio). Gated on reports.view.
 */
export async function parseTisUpload(formData: FormData): Promise<ParseUploadResult> {
  const ctx = await getUserContext();
  if (!ctx) return { ok: false, error: 'err_unauthorized' };
  if (!hasPermission(ctx, 'reports.view') && !hasPermission(ctx, 'customers.manage')) return { ok: false, error: 'err_unauthorized' };

  const file = formData.get('file');
  if (!(file instanceof File)) return { ok: false, error: 'err_no_file' };
  if (file.size === 0) return { ok: false, error: 'err_empty' };
  if (file.size > MAX_BYTES) return { ok: false, error: 'err_too_large' };

  const name = file.name.toLowerCase();
  try {
    let records: Record<string, string>[];
    if (name.endsWith('.xlsx')) {
      records = parseXlsxBuffer(Buffer.from(await file.arrayBuffer())).rows;
    } else if (name.endsWith('.json')) {
      records = parseJson(await file.text()).rows;
    } else {
      // .csv / .txt / unknown → CSV.
      records = parseCsv(await file.text()).rows;
    }
    const rows = mapRecordsToUploadRows(records);
    const mapped = rows.filter((r) => (r.name || r.code || r.id) && (r.lat != null || r.salesmanId || r.routeId || r.grade)).length;
    if (rows.length === 0) return { ok: false, error: 'err_no_rows' };
    // Canonical fields that actually received a value (for the preview).
    const columns = [...new Set(rows.flatMap((r) => Object.entries(r).filter(([, v]) => v != null).map(([k]) => k)))];
    return { ok: true, rows, total: records.length, mapped, columns };
  } catch {
    return { ok: false, error: 'err_parse' };
  }
}
