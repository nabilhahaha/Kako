import { createClient } from '@/lib/supabase/server';
import type { Branch, BranchRole, Profile } from './types';

export interface BranchMembership {
  branch: Branch;
  role: BranchRole;
  is_default: boolean;
}

export interface UserContext {
  userId: string;
  profile: Profile;
  isSuperAdmin: boolean;
  memberships: BranchMembership[];
  /** Highest-privilege role across all branches, used for nav gating. */
  topRole: BranchRole;
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

  return {
    userId: user.id,
    profile: profile as Profile,
    isSuperAdmin: (profile as Profile).is_super_admin,
    memberships,
    topRole,
  };
}

export { ROLE_RANK };
