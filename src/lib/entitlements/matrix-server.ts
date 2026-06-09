import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ModuleCategory } from './types';

// Read models for the Platform-Owner capability matrix. Owner-scoped (RLS allows
// the platform owner to read every company + the catalog).

export interface MatrixRow {
  moduleKey: string;
  labelEn: string;
  labelAr: string | null;
  category: ModuleCategory;
  platformFlag: string | null;
  isEnabled: boolean;
}

export interface CompanyLite { id: string; name: string }

export async function loadCompanies(supabase: SupabaseClient, limit = 500): Promise<CompanyLite[]> {
  const { data } = await supabase.from('erp_companies').select('id, name').order('name').limit(limit);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({ id: String(r.id), name: String(r.name) }));
}

/** The full module catalog with this company's module-level entitlement state. */
export async function loadCapabilityMatrix(supabase: SupabaseClient, companyId: string): Promise<MatrixRow[]> {
  const { data: mods } = await supabase
    .from('erp_modules')
    .select('module_key, label_en, label_ar, category, platform_flag, sort')
    .eq('is_active', true).order('sort');
  const { data: ents } = await supabase
    .from('erp_company_entitlements')
    .select('module_key, is_enabled')
    .eq('company_id', companyId).is('feature_key', null);
  const enabled = new Map(((ents ?? []) as { module_key: string; is_enabled: boolean }[]).map((e) => [e.module_key, e.is_enabled]));
  return ((mods ?? []) as Record<string, unknown>[]).map((m) => ({
    moduleKey: String(m.module_key),
    labelEn: String(m.label_en),
    labelAr: (m.label_ar as string) ?? null,
    category: m.category as ModuleCategory,
    platformFlag: (m.platform_flag as string) ?? null,
    isEnabled: enabled.get(String(m.module_key)) ?? false,
  }));
}

export interface FeatureRow {
  moduleKey: string;
  moduleLabelEn: string;
  featureKey: string;
  labelEn: string;
  labelAr: string | null;
  isEnabled: boolean;   // feature-level entitlement (default: inherits the enabled module → true)
}

/** Features of the modules a company is ENTITLED to, with their feature-level
 *  entitlement state. Only modules with an active module-level entitlement appear,
 *  so a Company Admin only ever sees what the Platform Owner allowed. */
export async function loadCompanyFeatureSettings(supabase: SupabaseClient, companyId: string): Promise<FeatureRow[]> {
  const { data: ents } = await supabase
    .from('erp_company_entitlements')
    .select('module_key, feature_key, is_enabled')
    .eq('company_id', companyId);
  const rows = (ents ?? []) as { module_key: string; feature_key: string | null; is_enabled: boolean }[];
  const enabledModules = new Set(rows.filter((r) => r.feature_key === null && r.is_enabled).map((r) => r.module_key));
  if (enabledModules.size === 0) return [];
  const featureState = new Map(rows.filter((r) => r.feature_key !== null).map((r) => [`${r.module_key}:${r.feature_key}`, r.is_enabled]));

  const { data: feats } = await supabase
    .from('erp_features')
    .select('module_key, feature_key, label_en, label_ar, erp_modules!inner(label_en)')
    .eq('is_active', true)
    .in('module_key', [...enabledModules]);
  return ((feats ?? []) as Record<string, unknown>[]).map((f) => {
    const key = `${String(f.module_key)}:${String(f.feature_key)}`;
    return {
      moduleKey: String(f.module_key),
      moduleLabelEn: String((f.erp_modules as { label_en?: string } | null)?.label_en ?? f.module_key),
      featureKey: String(f.feature_key),
      labelEn: String(f.label_en),
      labelAr: (f.label_ar as string) ?? null,
      // default ON (inherits the enabled module) unless an explicit feature row disables it
      isEnabled: featureState.has(key) ? Boolean(featureState.get(key)) : true,
    };
  });
}
