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
