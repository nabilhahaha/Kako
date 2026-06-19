import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { Branch, BranchRole, Company, Profile } from './types';
import { ALL_PERMISSIONS, applyFashionUmbrella, type Permission } from './permissions';
import { ALL_MODULES, type Module } from './navigation';
import { isRoutePlannerDemoAccount } from './route-planner-demo';
import { isRoutePlannerAdminAccount } from './route-planner-admin';
import { isRoutePlannerExperience } from './route-planner-experience';
import { TEMP_ACCESS_ENFORCEMENT_ENABLED, partitionGrantKeys, USER_ACCESS_OVERRIDES_ENABLED, ROLE_PERMISSION_OVERRIDES_ENABLED, applyAccessOverrides } from '@/lib/role-governance';
import { log } from '@/lib/observability';

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
  /** True when the user gets the standalone, chrome-free Route Planner experience —
   *  driven by membership of a Route Planner tenant (company.plan_key `route_planner*`),
   *  with the demo email as a temporary trigger. THIS is what the layout / home / page
   *  read. Computed by the single `isRoutePlannerExperience` helper. */
  isRoutePlannerExperience: boolean;
  /** True ONLY for the temporary demo account (email). Used for demo-specific labelling
   *  (the "Route Planner Demo" badge); real tenants get the experience without the badge. */
  isRoutePlannerDemo: boolean;
  /** True for the limited, product-scoped "Route Planner Admin" — manages only Route
   *  Planner tenants/subscriptions, never the full platform. Computed by the single
   *  `isRoutePlannerAdminAccount` helper. */
  isRoutePlannerAdmin: boolean;
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
  auditor: 1,
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

  // Temporary-access enforcement (Step 2, flag-gated KAKO_TEMP_ACCESS_ENFORCEMENT,
  // default OFF). GRANT-ONLY: union a user's ACTIVE temporary grants (effective
  // window + not expired) into their effective permissions. Company-isolated (RLS
  // + explicit company filter), audited via the structured log. No deny rules, no
  // RLS/visibility/approval changes. Super admins already hold everything.
  if (!superAdmin && companyId && TEMP_ACCESS_ENFORCEMENT_ENABLED()) {
    const nowIso = new Date().toISOString();
    const { data: grantRows } = await supabase
      .from('erp_temporary_access_grants')
      .select('grant_key')
      .eq('company_id', companyId)
      .eq('user_id', user.id)
      .is('expired_at', null)
      .lte('effective_from', nowIso)
      .gte('effective_to', nowIso);
    const keys = [...new Set((grantRows ?? []).map((r) => r.grant_key as string))];
    if (keys.length > 0) {
      const { perms, roleKeys } = partitionGrantKeys(keys, ALL_PERMISSIONS);
      const granted = new Set<Permission>(perms as Permission[]);
      // Expand any granted ROLE keys → permissions (company config authoritative,
      // else global defaults — mirrors the user's own role resolution above).
      if (roleKeys.length > 0) {
        const { data: cRows } = await supabase
          .from('erp_company_role_permissions')
          .select('role_key, permission')
          .eq('company_id', companyId)
          .in('role_key', roleKeys);
        const rolesWithCompany = new Set((cRows ?? []).map((r) => r.role_key as string));
        for (const r of cRows ?? []) granted.add(r.permission as Permission);
        const globalRoles = roleKeys.filter((rk) => !rolesWithCompany.has(rk));
        if (globalRoles.length > 0) {
          const { data: gRows } = await supabase
            .from('erp_role_permissions')
            .select('permission')
            .in('role_key', globalRoles);
          for (const r of gRows ?? []) granted.add(r.permission as Permission);
        }
      }
      const added = [...granted].filter((p) => !permissions.includes(p));
      if (added.length > 0) {
        permissions = [...new Set([...permissions, ...granted])];
        log.info('temp_access.applied', { userId: user.id, companyId, grants: keys, added });
      }
    }
  }

  // Role Permission Overrides (Block 1.5, flag-gated KAKO_ROLE_PERMISSION_OVERRIDES
  // AND per-company entitlement, default OFF). Applies a ROLE's operational
  // overrides (kind='role_override', role_key IN the user's roles) — grants add,
  // revokes remove — bounded by the delegable operational allowlist. Applied
  // BEFORE user overrides so user-level always wins. Super admins hold everything.
  if (!superAdmin && companyId && ROLE_PERMISSION_OVERRIDES_ENABLED()) {
    const { data: rent } = await supabase
      .from('erp_company_entitlements')
      .select('is_enabled')
      .eq('company_id', companyId)
      .eq('feature_key', 'platform.role_permission_overrides')
      .eq('is_enabled', true)
      .limit(1);
    const userRoles = [...new Set(memberships.map((m) => m.role as string))];
    if (rent && rent.length > 0 && userRoles.length > 0) {
      const { data: roleRows } = await supabase
        .from('erp_temporary_access_grants')
        .select('grant_key, effect')
        .eq('company_id', companyId)
        .eq('kind', 'role_override')
        .is('expired_at', null)
        .in('role_key', userRoles);
      if (roleRows && roleRows.length > 0) {
        const { effective, appliedGrants, appliedRevokes } = applyAccessOverrides(
          permissions,
          roleRows.map((r) => ({ permission: r.grant_key as string, effect: r.effect as 'grant' | 'revoke' })),
        );
        permissions = effective as Permission[];
        log.info('role_override.applied', { userId: user.id, companyId, roles: userRoles, grants: appliedGrants, revokes: appliedRevokes });
      }
    }
  }

  // User Access Overrides (Block 2, flag-gated KAKO_USER_ACCESS_OVERRIDES, default
  // OFF). Independent of temporary-access above. Applies a user's PERMANENT
  // operational overrides (kind='override'): grants add, revokes remove — bounded
  // by the delegable operational allowlist (re-validated here every resolve, so a
  // stored override outside the set is ignored). Permanent rows have a NULL window;
  // dated rows still honour it. No deny rules beyond revoke; no RLS/visibility/
  // approval changes. Super admins already hold everything.
  if (!superAdmin && companyId && USER_ACCESS_OVERRIDES_ENABLED()) {
    // Per-company gate: even with the global flag on, the override path applies
    // ONLY to companies the Platform Owner has entitled (reference/demo tenant
    // first). Queried only when the flag is on, so default-OFF adds no work.
    const { data: ent } = await supabase
      .from('erp_company_entitlements')
      .select('is_enabled')
      .eq('company_id', companyId)
      .eq('feature_key', 'platform.user_access_overrides')
      .eq('is_enabled', true)
      .limit(1);
    if (!ent || ent.length === 0) {
      // not entitled → skip the override path entirely for this company
    } else {
    const nowIso = new Date().toISOString();
    const { data: ovRows } = await supabase
      .from('erp_temporary_access_grants')
      .select('grant_key, effect, effective_from, effective_to')
      .eq('company_id', companyId)
      .eq('user_id', user.id)
      .eq('kind', 'override')
      .is('expired_at', null);
    const active = (ovRows ?? []).filter((r) => {
      const from = r.effective_from as string | null;
      const to = r.effective_to as string | null;
      return (from === null || from <= nowIso) && (to === null || to >= nowIso);
    });
    if (active.length > 0) {
      const { effective, appliedGrants, appliedRevokes } = applyAccessOverrides(
        permissions,
        active.map((r) => ({ permission: r.grant_key as string, effect: r.effect as 'grant' | 'revoke' })),
      );
      permissions = effective as Permission[];
      log.info('access_override.applied', {
        userId: user.id, companyId, grants: appliedGrants, revokes: appliedRevokes,
      });
    }
    }
  }

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
    isRoutePlannerExperience: isRoutePlannerExperience({ email: (profile as Profile | null)?.email ?? user.email, companyPlanKey: company?.plan_key }),
    isRoutePlannerDemo: isRoutePlannerDemoAccount({ email: (profile as Profile | null)?.email ?? user.email, topRole, permissions }),
    isRoutePlannerAdmin: isRoutePlannerAdminAccount({ email: (profile as Profile | null)?.email ?? user.email, topRole, permissions }),
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
