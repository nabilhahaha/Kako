'use server';

import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { getEntity, entityCapabilities } from '@/lib/erp/entities';

/** ── Export Engine: live row-count preview ─────────────────────────────────
 *  Counts how many records the current filters would export for an entity,
 *  using the SAME permission + company-scope + filter rules as the download
 *  route, so the number the user sees matches what they get. */

interface Result { ok: boolean; error?: string; count?: number }

export async function exportCount(
  entityKey: string,
  q = '',
  status = '',
): Promise<Result> {
  const ctx = await getUserContext();
  if (!ctx) return { ok: false, error: 'unauthorized' };
  if (!hasPermission(ctx, 'integrations.manage')) return { ok: false, error: 'unauthorized' };

  const entity = getEntity(entityKey);
  if (!entity || !entity.fields || entity.fields.length === 0 || !entityCapabilities(entityKey).exportable)
    return { ok: false, error: 'unknown entity' };
  if (entity.permission && !hasPermission(ctx, entity.permission))
    return { ok: false, error: 'unauthorized' };

  const textCols = entity.fields
    .filter((f) => !f.type || f.type === 'text' || f.type === 'email')
    .map((f) => f.key);
  const cleanQ = q.trim().replace(/[,()%*\\]/g, ' ').trim();

  const supabase = await createClient();
  let query = supabase.from(entity.table).select('id', { count: 'exact', head: true });
  if (status.trim()) query = query.eq('status', status.trim());
  if (cleanQ && textCols.length > 0)
    query = query.or(textCols.map((c) => `${c}.ilike.%${cleanQ}%`).join(','));

  const { count, error } = await query;
  if (error) return { ok: false, error: error.message };
  return { ok: true, count: count ?? 0 };
}
