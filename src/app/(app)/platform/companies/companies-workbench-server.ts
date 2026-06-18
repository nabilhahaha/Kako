import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Company, Branch } from '@/lib/erp/types';
import { getCompanyUsage, type Plan, type CompanyUsage } from '@/lib/erp/plans';

/** Read-only loaders for the Companies workbench. Platform-gated by the page;
 *  these only read. No business-logic change. */

export interface CompanyListRow {
  id: string;
  name: string;
  name_ar: string | null;
  is_active: boolean;
  plan_key: string | null;
}

export async function loadCompaniesList(supabase: SupabaseClient): Promise<CompanyListRow[]> {
  const { data } = await supabase
    .from('erp_companies')
    .select('id, name, name_ar, is_active, plan_key')
    .order('name')
    .limit(500);
  return (data ?? []) as CompanyListRow[];
}

export interface CompanyTabData {
  company: Company;
  branches: Branch[];
  plans: Plan[];
  modulesByPlan: Record<string, string[]>;
  enabledModules: string[];
  usage: CompanyUsage;
}

export async function loadCompanyTabData(supabase: SupabaseClient, id: string): Promise<CompanyTabData | null> {
  const { data: company } = await supabase.from('erp_companies').select('*').eq('id', id).maybeSingle();
  if (!company) return null;
  const [{ data: branches }, { data: plansData }, { data: planMod }, { data: companyMod }, usage] = await Promise.all([
    supabase.from('erp_branches').select('*').eq('company_id', id).order('created_at', { ascending: true }),
    supabase.from('erp_plans').select('key, name_ar, max_users, max_branches, max_products, rank').order('rank', { ascending: true }),
    supabase.from('erp_plan_modules').select('plan_key, module'),
    supabase.from('erp_company_modules').select('module, enabled').eq('company_id', id),
    getCompanyUsage(supabase, id),
  ]);
  const modulesByPlan: Record<string, string[]> = {};
  for (const pm of planMod ?? []) (modulesByPlan[pm.plan_key as string] ??= []).push(pm.module as string);
  const enabledModules = (companyMod ?? []).filter((m) => m.enabled).map((m) => m.module as string);
  return {
    company: company as Company,
    branches: (branches as Branch[]) ?? [],
    plans: (plansData as Plan[]) ?? [],
    modulesByPlan,
    enabledModules,
    usage,
  };
}
