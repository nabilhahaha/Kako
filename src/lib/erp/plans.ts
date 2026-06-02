import type { SupabaseClient } from '@supabase/supabase-js';

// Subscription plans cap how many users / branches / products a tenant company
// may have. NULL limit = unlimited. Limits are enforced in server actions
// (creating branches / assigning users) against the company's current usage.

export interface Plan {
  key: string;
  name_ar: string;
  max_users: number | null;
  max_branches: number | null;
  max_products: number | null;
  rank: number;
}

export interface CompanyUsage {
  users: number;
  branches: number;
  products: number;
}

type DB = SupabaseClient;

/** The plan attached to a company (null when the company has none). */
export async function getCompanyPlan(supabase: DB, companyId: string): Promise<Plan | null> {
  const { data: company } = await supabase
    .from('erp_companies')
    .select('plan_key')
    .eq('id', companyId)
    .maybeSingle();
  const planKey = (company as { plan_key?: string } | null)?.plan_key;
  if (!planKey) return null;
  const { data: plan } = await supabase
    .from('erp_plans')
    .select('key, name_ar, max_users, max_branches, max_products, rank')
    .eq('key', planKey)
    .maybeSingle();
  return (plan as Plan | null) ?? null;
}

/** Current usage tallies for a company. */
export async function getCompanyUsage(supabase: DB, companyId: string): Promise<CompanyUsage> {
  const { data: branchRows } = await supabase
    .from('erp_branches')
    .select('id')
    .eq('company_id', companyId);
  const branchIds = ((branchRows as { id: string }[]) ?? []).map((b) => b.id);

  let users = 0;
  if (branchIds.length > 0) {
    const { data: ub } = await supabase
      .from('erp_user_branches')
      .select('user_id')
      .in('branch_id', branchIds);
    users = new Set(((ub as { user_id: string }[]) ?? []).map((u) => u.user_id)).size;
  }

  const { count: products } = await supabase
    .from('erp_products_catalog')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId);

  return { users, branches: branchIds.length, products: products ?? 0 };
}

/**
 * Returns an Arabic error message when adding a branch would exceed the plan,
 * or null when it is allowed.
 */
export async function checkBranchLimit(supabase: DB, companyId: string): Promise<string | null> {
  const plan = await getCompanyPlan(supabase, companyId);
  const max = plan?.max_branches ?? null;
  if (max === null) return null;
  const { count } = await supabase
    .from('erp_branches')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId);
  if ((count ?? 0) >= max)
    return `وصلت الشركة للحد الأقصى للفروع في خطتها (${max}). يرجى ترقية الخطة.`;
  return null;
}

/**
 * Returns an Arabic error message when adding a *new* user to the company would
 * exceed the plan, or null when allowed. A user already in the company does not
 * count again (e.g. assigning an existing member to another branch).
 */
export async function checkUserLimit(
  supabase: DB,
  companyId: string,
  candidateUserId?: string,
): Promise<string | null> {
  const plan = await getCompanyPlan(supabase, companyId);
  const max = plan?.max_users ?? null;
  if (max === null) return null;

  const { data: branchRows } = await supabase
    .from('erp_branches')
    .select('id')
    .eq('company_id', companyId);
  const branchIds = ((branchRows as { id: string }[]) ?? []).map((b) => b.id);
  if (branchIds.length === 0) return null;

  const { data: ub } = await supabase
    .from('erp_user_branches')
    .select('user_id')
    .in('branch_id', branchIds);
  const members = new Set(((ub as { user_id: string }[]) ?? []).map((u) => u.user_id));

  if (candidateUserId && members.has(candidateUserId)) return null; // already counted
  if (members.size >= max)
    return `وصلت الشركة للحد الأقصى للمستخدمين في خطتها (${max}). يرجى ترقية الخطة.`;
  return null;
}
