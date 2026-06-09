import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RecipientType } from './types';

// Resolve a rule's recipients to user ids. Reuses the proven workflow resolver
// (erp_workflow_resolve_users) for role / company_admin / user. Permission-based
// recipients fall back to company admins (a safe default) until a permission→users
// resolver exists; admins always hold the broadest permissions.

export async function resolveRecipients(
  db: SupabaseClient,
  companyId: string,
  recipientType: RecipientType,
  recipientRef: string | null,
): Promise<string[]> {
  const type = recipientType === 'permission' ? 'company_admin' : recipientType;
  const ref = recipientType === 'permission' ? null : recipientRef;
  const { data, error } = await db.rpc('erp_workflow_resolve_users', {
    p_company: companyId,
    p_type: type,
    p_ref: ref,
  });
  if (error) return [];
  return ((data ?? []) as (string | { erp_workflow_resolve_users?: string })[])
    .map((r) => (typeof r === 'string' ? r : r.erp_workflow_resolve_users))
    .filter((x): x is string => typeof x === 'string');
}
