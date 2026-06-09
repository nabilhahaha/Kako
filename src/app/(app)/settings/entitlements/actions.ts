'use server';

import { createClient } from '@/lib/supabase/server';
import { requireAuth, type ActionResult } from '@/lib/erp/guards';
import { hasPermission } from '@/lib/erp/permissions';
import { logAudit } from '@/lib/erp/audit';
import { ENTITLEMENTS_ENABLED } from '@/lib/entitlements';
import { isEntitled } from '@/lib/entitlements/gate-server';

/** Company Admin: set a FEATURE-level entitlement for their company — capped at
 *  the module entitlement (the module must be enabled). The cap is enforced here
 *  AND by RLS (0265). Module-level enablement stays platform-owner-only. Audited. */
export async function setFeatureEntitlement(
  moduleKey: string,
  featureKey: string,
  enabled: boolean,
): Promise<ActionResult> {
  if (!ENTITLEMENTS_ENABLED()) return { ok: false, error: 'disabled' };
  const { ctx } = await requireAuth();
  if (!ctx) return { ok: false, error: 'unauthorized' };
  if (!ctx.companyId) return { ok: false, error: 'no_company' };
  if (!hasPermission(ctx, 'settings.branches') && !ctx.isSuperAdmin) return { ok: false, error: 'forbidden' };
  if (!moduleKey || !featureKey) return { ok: false, error: 'missing' };

  const supabase = await createClient();
  // Cap: the company must be entitled to the module before configuring its features.
  if (!(await isEntitled(supabase, ctx.companyId, moduleKey))) return { ok: false, error: 'module_not_entitled' };

  const { data: existing } = await supabase
    .from('erp_company_entitlements')
    .select('id')
    .eq('company_id', ctx.companyId).eq('module_key', moduleKey).eq('feature_key', featureKey)
    .maybeSingle();
  const { error } = existing
    ? await supabase.from('erp_company_entitlements').update({ is_enabled: enabled, updated_by: ctx.userId }).eq('id', (existing as { id: string }).id)
    : await supabase.from('erp_company_entitlements').insert({ company_id: ctx.companyId, module_key: moduleKey, feature_key: featureKey, is_enabled: enabled, updated_by: ctx.userId });
  if (error) return { ok: false, error: error.message };

  await logAudit(supabase, {
    action: enabled ? 'enable' : 'disable',
    entity: 'entitlement_feature',
    entityId: `${ctx.companyId}:${moduleKey}:${featureKey}`,
    companyId: ctx.companyId,
    details: { module_key: moduleKey, feature_key: featureKey, is_enabled: enabled },
  });
  return { ok: true };
}
