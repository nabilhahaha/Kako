import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { Branch, BranchRole, Company, Profile } from './types';
import { ALL_PERMISSIONS, applyFashionUmbrella, type Permission } from './permissions';
import { ALL_MODULES, type Module } from './navigation';

export interface BranchMembership {
  branch: Branch;
  role: BranchRole;
  is_default: boolean;
}

export interface UserContext {
  userId: string;
  profile: Profile;
  isSuperAdmin: boolean;
  /** The vendor that runs the platform; sees/manages across all tenants. */
  isPlatformOwner: boolean;
  memberships: BranchMembership[];
  /** The tenant company the user belongs to (from their default branch). */
  companyId: string | null;
  company: Company | null;
  /** Highest-privilege role across all branches, used for nav gating. */
  topRole: BranchRole;
  /** Effective permissions (union across the user's roles; all for super admin). */
  permissions: Permission[];
  /** Feature modules unlocked by the company's plan (all for owner/super admin). */
  modules: Module[];
}

const ROLE_RANK: Record<BranchRole, number> = {
  admin: 8,
  manager: 7,
  // FMCG sales hierarchy (S2). Director/NSM high; Branch Manager mid; scope = S4.
  sales_director: 7,
  national_sales_manager: 7,
  regional_manager: 6,
  branch_manager: 6,
  it_admin: 6,
  area_manager: 5,
  supervisor: 6,
  accountant: 5,
  doctor: 5,
  warehouse_keeper: 4,
  cashier: 3,
  technician: 3,
  stylist: 3,
  salesman: 2,
  driver: 2,
  receptionist: 2,
  staff: 1,
  housekeeping: 1,
  viewer: 0,
};

/**
 * Loads the signed-in user's profile and branch memberships.
 * Returns null when there is no authenticated session.
 */
async function resolveUserContext(): Promise<UserContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('erp_profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (!profile) return null;

  const { data: rows } = await supabase
    .from('erp_user_branches')
    .select('role, is_default, branch:erp_branches(*)')
    .eq('user_id', user.id);

  const memberships: BranchMembership[] = (rows ?? [])
    .filter((r) => r.branch)
    .map((r) => ({
      // supabase returns the joined row as an object via the FK relationship
      branch: r.branch as unknown as Branch,
      role: r.role as BranchRole,
      is_default: r.is_default,
    }));

  const topRole: BranchRole = (profile as Profile).is_super_admin
    ? 'admin'
    : memberships.reduce<BranchRole>((best, m) => {
        return ROLE_RANK[m.role] > ROLE_RANK[best] ? m.role : best;
      }, 'viewer');

  // The tenant company: the default branch's company (fallback: first branch).
  const defaultMembership =
    memberships.find((m) => m.is_default) ?? memberships[0] ?? null;
  const companyId = defaultMembership?.branch.company_id ?? null;
  let company: Company | null = null;
  if (companyId) {
    const { data: companyRow } = await supabase
      .from('erp_companies')
      .select('*')
      .eq('id', companyId)
      .maybeSingle();
    company = (companyRow as Company | null) ?? null;
  }

  // Effective permissions: super admin gets all; others get the union of their
  // roles' permissions. Permissions are resolved per the user's tenant company
  // (erp_company_role_permissions), so the same role can carry different
  // capabilities in a pharmacy vs a food distributor vs a hotel. Companies
  // without their own config fall back to the global defaults (erp_role_permissions).
  const superAdmin = (profile as Profile).is_super_admin;
  let permissions: Permission[] = [];
  if (superAdmin) {
    permissions = [...ALL_PERMISSIONS];
  } else {
    const roleKeys = [...new Set(memberships.map((m) => m.role as string))];
    if (roleKeys.length > 0) {
      let resolvedFromCompany = false;

      if (companyId) {
        // Which of the user's roles are enabled for their company?
        const { data: companyRoles } = await supabase
          .from('erp_company_roles')
          .select('role_key, enabled')
          .eq('company_id', companyId);

        if (companyRoles && companyRoles.length > 0) {
          // The company has its own role config → it is authoritative.
          resolvedFromCompany = true;
          const enabledKeys = companyRoles
            .filter((r) => r.enabled && roleKeys.includes(r.role_key as string))
            .map((r) => r.role_key as string);

          if (enabledKeys.length > 0) {
            const { data: perms } = await supabase
              .from('erp_company_role_permissions')
              .select('permission')
              .eq('company_id', companyId)
              .in('role_key', enabledKeys);
            permissions = [...new Set((perms ?? []).map((p) => p.permission as Permission))];
          }
        }
      }

      if (!resolvedFromCompany) {
        // No company-scoped config (legacy tenant): use the global defaults.
        const { data: perms } = await supabase
          .from('erp_role_permissions')
          .select('permission')
          .in('role_key', roleKeys);
        permissions = [...new Set((perms ?? []).map((p) => p.permission as Permission))];
      }
    }
  }

  // Fashion Store: `fashion.manage` is the owner umbrella → it implies the full
  // granular fashion.* set, so a clothing manager/owner reaches the whole store.
  permissions = applyFashionUmbrella(permissions);

  // Feature modules: the owner / super admin see everything. A tenant sees the
  // intersection of (a) the modules its business type / company enables and
  // (b) the modules its plan unlocks — so a hotel never shows inventory, and a
  // free plan never shows accounting. Each layer falls back to "all" when it
  // has no config, so legacy tenants are not accidentally locked out.
  const isPlatformOwner = (profile as Profile).is_platform_owner === true;
  let modules: Module[] = [...ALL_MODULES];
  if (!superAdmin && !isPlatformOwner) {
    const planKey = (company as { plan_key?: string } | null)?.plan_key;

    let planModules: Module[] = [...ALL_MODULES];
    if (planKey) {
      const { data: pm } = await supabase
        .from('erp_plan_modules')
        .select('module')
        .eq('plan_key', planKey);
      if (pm && pm.length > 0) planModules = pm.map((m) => m.module as Module);
    }

    let companyModules: Module[] = [...ALL_MODULES];
    if (companyId) {
      const { data: cm } = await supabase
        .from('erp_company_modules')
        .select('module, enabled')
        .eq('company_id', companyId);
      if (cm && cm.length > 0) {
        companyModules = cm.filter((m) => m.enabled).map((m) => m.module as Module);
      }
    }

    // The plan only gates the coarse modules it lists (sales/inventory/…);
    // finer per-item modules (pos, sales_orders, returns, warehousing) are
    // driven purely by the company/business-type config and pass through.
    modules = companyModules.filter(
      (m) => !ALL_MODULES.includes(m) || planModules.includes(m),
    );
  }

  return {
    userId: user.id,
    profile: profile as Profile,
    isSuperAdmin: superAdmin,
    isPlatformOwner,
    memberships,
    companyId,
    company,
    topRole,
    permissions,
    modules,
  };
}

/**
 * Request-memoized: React `cache()` dedupes resolution within a single server
 * request, so the layout + page + child server components (and a server action)
 * each reuse ONE resolution instead of re-running the several auth/membership/
 * module queries. No cross-request caching — the cache lifetime is the request.
 */
export const getUserContext = cache(resolveUserContext);

export { ROLE_RANK };
