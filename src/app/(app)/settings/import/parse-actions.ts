'use server';

import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { parseXlsxBuffer } from '@/lib/erp/xlsx-read';

/** ── Import Engine: server-side .xlsx parsing ──────────────────────────────
 *  Real Excel files are binary OOXML (zip + deflate), so they're parsed on the
 *  Node runtime where zlib is available. The browser sends the file bytes as
 *  base64; we decode and return the same { headers, rows } shape as CSV/JSON,
 *  so the rest of the import pipeline is source-agnostic. */

interface Result<T> { ok: boolean; error?: string; data?: T }

export async function parseXlsx(
  base64: string,
): Promise<Result<{ headers: string[]; rows: Record<string, string>[] }>> {
  const ctx = await getUserContext();
  if (!ctx) return { ok: false, error: 'unauthorized' };
  if (!hasPermission(ctx, 'integrations.manage')) return { ok: false, error: 'unauthorized' };

  try {
    const buf = Buffer.from(base64, 'base64');
    if (buf.length === 0) return { ok: false, error: 'empty file' };
    const parsed = parseXlsxBuffer(buf);
    return { ok: true, data: parsed };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'could not read Excel file' };
  }
}
