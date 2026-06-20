'use server';

import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { parseXlsxBuffer } from '@/lib/erp/xlsx-read';
import { parseCsv, parseJson } from '@/lib/erp/import-parse';
import { suggestColumnMapping, type TisFieldKey } from '@/lib/tis/upload';

export type ParseColumnsResult =
  | { ok: true; headers: string[]; records: Record<string, string>[]; suggested: Partial<Record<TisFieldKey, string>> }
  | { ok: false; error: string };

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

/**
 * Parse an uploaded file (CSV / XLSX / JSON) into RAW headers + records plus a
 * suggested column mapping — so the Route Planner can let the manager map their own
 * column names onto the canonical fields (no dependency on exact header text). The
 * client applies the (possibly edited) mapping with `applyColumnMapping`. No live
 * write. Gated on reports.view.
 */
export async function parseUploadColumns(formData: FormData): Promise<ParseColumnsResult> {
  const ctx = await getUserContext();
  if (!ctx) return { ok: false, error: 'err_unauthorized' };
  // Same audience as the page: the Route Planner Demo account, or anyone with the
  // dedicated route_planner.* permission, or a manager/supervisor with reports.view.
  const allowed = ctx.isRoutePlannerExperience
    || hasPermission(ctx, 'route_planner.upload') || hasPermission(ctx, 'route_planner.view')
    || hasPermission(ctx, 'reports.view');
  if (!allowed) return { ok: false, error: 'err_unauthorized' };

  const file = formData.get('file');
  if (!(file instanceof File)) return { ok: false, error: 'err_no_file' };
  if (file.size === 0) return { ok: false, error: 'err_empty' };
  if (file.size > MAX_BYTES) return { ok: false, error: 'err_too_large' };

  const name = file.name.toLowerCase();
  try {
    const sheet = name.endsWith('.xlsx')
      ? parseXlsxBuffer(Buffer.from(await file.arrayBuffer()))
      : name.endsWith('.json')
        ? parseJson(await file.text())
        : parseCsv(await file.text());
    if (sheet.headers.length === 0 || sheet.rows.length === 0) return { ok: false, error: 'err_no_rows' };
    return { ok: true, headers: sheet.headers, records: sheet.rows, suggested: suggestColumnMapping(sheet.headers) };
  } catch {
    return { ok: false, error: 'err_parse' };
  }
}
