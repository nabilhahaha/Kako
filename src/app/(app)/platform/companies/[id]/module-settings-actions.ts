'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { logAudit } from '@/lib/erp/audit';
import { getT } from '@/lib/i18n/server';
import { findSetting, type SettingValue } from '@/lib/erp/module-settings-catalog';

/**
 * Module Configuration / Workflow Settings — write actions (Phase 1 foundation).
 *
 * These persist per-company overrides into `erp_module_settings` and audit every
 * change. They are the foundation for the editor that arrives in Phase 2 — the
 * Company 360 surface is read-only for now, and NOTHING enforces these values yet
 * (no business-logic change). Guarded to the platform owner (the Company 360
 * surface); company-admin self-service is a later phase. Only the 'company' scope
 * is written (scope_id = '').
 */

async function requirePlatformOwner() {
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) return { ctx: null, error: t('platform.errors.unauthorized') };
  if (!ctx.isPlatformOwner) return { ctx: null, error: t('platform.errors.ownerRequired') };
  return { ctx, error: null };
}

/** Strict type/range validation against the catalog definition. */
function validate(module: string, key: string, value: SettingValue): { ok: true } | { ok: false } {
  const def = findSetting(module, key);
  if (!def) return { ok: false };
  if (def.type === 'boolean') return typeof value === 'boolean' ? { ok: true } : { ok: false };
  if (def.type === 'number') {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? { ok: true } : { ok: false };
  }
  // enum
  return typeof value === 'string' && (def.options?.includes(value) ?? false) ? { ok: true } : { ok: false };
}

/** Upsert one company-scoped override. */
export async function setCompanyModuleSetting(
  companyId: string,
  moduleKey: string,
  settingKey: string,
  value: SettingValue,
): Promise<ActionResult> {
  const { ctx, error } = await requirePlatformOwner();
  if (error || !ctx) return { ok: false, error: error ?? '' };
  if (!validate(moduleKey, settingKey, value)) {
    const { t } = await getT();
    return { ok: false, error: t('platform.errors.invalidInput') };
  }

  const supabase = await createClient();
  const { error: dbErr } = await supabase
    .from('erp_module_settings')
    .upsert(
      { company_id: companyId, module_key: moduleKey, setting_key: settingKey, value, scope: 'company', scope_id: '' },
      { onConflict: 'company_id,module_key,setting_key,scope,scope_id' },
    );
  if (dbErr) return { ok: false, error: friendlyDbError(dbErr) };

  await logAudit(supabase, {
    action: 'update',
    entity: 'module_setting',
    entityId: `${moduleKey}.${settingKey}`,
    details: { module: moduleKey, setting: settingKey, value, scope: 'company' },
    companyId,
  });
  revalidatePath(`/platform/companies/${companyId}`);
  return { ok: true };
}

/** Remove a company override → the setting falls back to the catalog default. */
export async function resetCompanyModuleSetting(
  companyId: string,
  moduleKey: string,
  settingKey: string,
): Promise<ActionResult> {
  const { ctx, error } = await requirePlatformOwner();
  if (error || !ctx) return { ok: false, error: error ?? '' };

  const supabase = await createClient();
  const { error: dbErr } = await supabase
    .from('erp_module_settings')
    .delete()
    .eq('company_id', companyId)
    .eq('module_key', moduleKey)
    .eq('setting_key', settingKey)
    .eq('scope', 'company')
    .eq('scope_id', '');
  if (dbErr) return { ok: false, error: friendlyDbError(dbErr) };

  await logAudit(supabase, {
    action: 'update',
    entity: 'module_setting',
    entityId: `${moduleKey}.${settingKey}`,
    details: { module: moduleKey, setting: settingKey, reset: true, scope: 'company' },
    companyId,
  });
  revalidatePath(`/platform/companies/${companyId}`);
  return { ok: true };
}
