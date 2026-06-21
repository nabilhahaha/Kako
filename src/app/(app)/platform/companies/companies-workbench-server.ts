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
  /** Display-only subscription/trial signals (read from the erp_companies cache). */
  trialEndsAt: string | null;
  subscriptionEnd: string | null;
  /** Cheap last-activity proxy (company row updated_at). */
  lastActivity: string | null;
  /** Distinct members across the company's branches. */
  userCount: number;
}

export async function loadCompaniesList(supabase: SupabaseClient): Promise<CompanyListRow[]> {
  const { data } = await supabase
    .from('erp_companies')
    .select('id, name, name_ar, is_active, plan_key, trial_ends_at, subscription_end, updated_at')
    .order('name')
    .limit(500);
  const rows = (data ?? []) as Record<string, unknown>[];

  // Display-only distinct-user counts per company — ONE grouped read, aggregated in memory.
  const usersByCompany = new Map<string, Set<string>>();
  const { data: ub } = await supabase
    .from('erp_user_branches')
    .select('user_id, branch:erp_branches!inner(company_id)');
  for (const r of (ub ?? []) as { user_id: string; branch: { company_id: string } | { company_id: string }[] }[]) {
    const b = Array.isArray(r.branch) ? r.branch[0] : r.branch;
    const cid = b?.company_id;
    if (!cid) continue;
    let set = usersByCompany.get(cid);
    if (!set) { set = new Set(); usersByCompany.set(cid, set); }
    set.add(r.user_id);
  }

  return rows.map((c) => ({
    id: c.id as string,
    name: c.name as string,
    name_ar: (c.name_ar as string | null) ?? null,
    is_active: c.is_active as boolean,
    plan_key: (c.plan_key as string | null) ?? null,
    trialEndsAt: (c.trial_ends_at as string | null) ?? null,
    subscriptionEnd: (c.subscription_end as string | null) ?? null,
    lastActivity: (c.updated_at as string | null) ?? null,
    userCount: usersByCompany.get(c.id as string)?.size ?? 0,
  }));
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
