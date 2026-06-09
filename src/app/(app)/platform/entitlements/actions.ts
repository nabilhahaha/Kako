'use server';

import { createClient } from '@/lib/supabase/server';
import { requireAuth, type ActionResult } from '@/lib/erp/guards';
import { logAudit } from '@/lib/erp/audit';
import { ENTITLEMENTS_ENABLED } from '@/lib/entitlements';

/** Platform-Owner: set a company's module-level entitlement. Owner-only (also
 *  enforced by RLS: erp_company_entitlements write = erp_is_platform_owner()).
 *  Upserts the row and audits the change. Flag-gated. */
export async function setModuleEntitlement(
  companyId: string,
  moduleKey: string,
  enabled: boolean,
): Promise<ActionResult> {
  if (!ENTITLEMENTS_ENABLED()) return { ok: false, error: 'disabled' };
  const { ctx } = await requireAuth();
  if (!ctx) return { ok: false, error: 'unauthorized' };
  if (!ctx.isPlatformOwner && !ctx.isSuperAdmin) return { ok: false, error: 'forbidden' };
  if (!companyId || !moduleKey) return { ok: false, error: 'missing' };

  const supabase = await createClient();
  // The unique index is expression-based (COALESCE(feature_key,'')), so do an
  // explicit upsert: update the existing module-level row, else insert.
  const { data: existing } = await supabase
    .from('erp_company_entitlements')
    .select('id')
    .eq('company_id', companyId).eq('module_key', moduleKey).is('feature_key', null)
    .maybeSingle();
  const error = existing
    ? (await supabase.from('erp_company_entitlements').update({ is_enabled: enabled, updated_by: ctx.userId }).eq('id', (existing as { id: string }).id)).error
    : (await supabase.from('erp_company_entitlements').insert({ company_id: companyId, module_key: moduleKey, feature_key: null, is_enabled: enabled, updated_by: ctx.userId })).error;
  if (error) return { ok: false, error: error.message };

  await logAudit(supabase, {
    action: enabled ? 'enable' : 'disable',
    entity: 'entitlement',
    entityId: `${companyId}:${moduleKey}`,
    companyId,
    details: { module_key: moduleKey, is_enabled: enabled },
  });
  return { ok: true };
}
