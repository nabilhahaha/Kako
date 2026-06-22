import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  MODULE_SETTINGS, coerceSettingValue,
  type ResolvedSetting,
} from './module-settings-catalog';

export type { ResolvedSetting };

/**
 * Resolve a company's effective Module Configuration / Workflow Settings.
 *
 * PHASE 1 resolution order: catalog default → company override. Role/user scopes
 * are future-ready in the table but NOT consulted here yet. Returns one entry per
 * catalog setting (complete map) so callers never deal with undefined. Server-only
 * (reads under the caller's RLS). Nothing enforces these values yet — this is the
 * read foundation for the Company 360 display and future enforcement.
 */

interface OverrideRow { module_key: string; setting_key: string; value: unknown }

/** Full resolved settings for a company (override row wins, else catalog default). */
export async function resolveCompanyModuleSettings(
  supabase: SupabaseClient,
  companyId: string | null | undefined,
): Promise<ResolvedSetting[]> {
  const overrides = new Map<string, unknown>();
  if (companyId) {
    const { data } = await supabase
      .from('erp_module_settings')
      .select('module_key, setting_key, value')
      .eq('company_id', companyId)
      .eq('scope', 'company')
      .eq('scope_id', '');
    for (const r of (data ?? []) as OverrideRow[]) {
      overrides.set(`${r.module_key}.${r.setting_key}`, r.value);
    }
  }
  return MODULE_SETTINGS.map((def) => {
    const k = `${def.module}.${def.key}`;
    if (overrides.has(k)) {
      return { def, value: coerceSettingValue(def, overrides.get(k)), source: 'company' as const };
    }
    return { def, value: def.default, source: 'default' as const };
  });
}
