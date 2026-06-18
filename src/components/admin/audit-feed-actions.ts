'use server';

import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';

export interface AuditFeedRow {
  id: string;
  action: string;
  entity: string;
  entity_id: string | null;
  actor_email: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

/**
 * Read-only per-entity audit feed for the Admin Workbench right panel. Tenant-
 * scoped (company_id) and admin-gated (settings.users), mirroring the audit-log
 * page; RLS independently restricts rows. Filters by entity_id, optionally
 * narrowed to a set of entity names. No writes, no logic change.
 */
export async function loadEntityAudit(
  entityId: string,
  entities?: string[],
  limit = 12,
): Promise<AuditFeedRow[]> {
  const ctx = await getUserContext();
  if (!ctx || !ctx.companyId || !hasPermission(ctx, 'settings.users') || !entityId) return [];
  const supabase = await createClient();
  let q = supabase
    .from('erp_audit_logs')
    .select('id, action, entity, entity_id, actor_email, details, created_at')
    .eq('company_id', ctx.companyId)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (entities && entities.length > 0) q = q.in('entity', entities);
  const { data } = await q;
  return (data ?? []) as AuditFeedRow[];
}
