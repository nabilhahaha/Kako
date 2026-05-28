import { createClient } from '@/lib/supabase/server';
import type { Branch, BranchRole, Company, Profile } from './types';
import { ALL_PERMISSIONS, type Permission } from './permissions';

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
}

const ROLE_RANK: Record<BranchRole, number> = {
  admin: 8,
  manager: 7,
  supervisor: 6,
  accountant: 5,
  warehouse_keeper: 4,
  cashier: 3,
  salesman: 2,
  staff: 1,
  viewer: 0,
};

/**
 * Loads the signed-in user's profile and branch memberships.
 * Returns null when there is no authenticated session.
 */
export async function getUserContext(): Promise<UserContext | null> {
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
  // roles' permissions from the DB matrix.
  const superAdmin = (profile as Profile).is_super_admin;
  let permissions: Permission[] = [];
  if (superAdmin) {
    permissions = [...ALL_PERMISSIONS];
  } else {
    const roleKeys = [...new Set(memberships.map((m) => m.role))];
    if (roleKeys.length > 0) {
      const { data: perms } = await supabase
        .from('erp_role_permissions')
        .select('permission')
        .in('role_key', roleKeys);
      permissions = [...new Set((perms ?? []).map((p) => p.permission as Permission))];
    }
  }

  return {
    userId: user.id,
    profile: profile as Profile,
    isSuperAdmin: superAdmin,
    isPlatformOwner: (profile as Profile).is_platform_owner === true,
    memberships,
    companyId,
    company,
    topRole,
    permissions,
  };
}

export { ROLE_RANK };
