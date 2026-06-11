import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserContext } from './auth-context';
import { DENY_ALL_CAPABILITIES } from './granular-capabilities';
import { toScopeRef, type ScopeRef } from './scope';
import { toRoleLimit, type RoleLimit } from './limits';

/**
 * VANTORA Authorization Console — server-only data loader (P3/P4/P6 surfaces).
 *
 * Returns a typed, serializable bundle of everything the console page needs,
 * loaded with parallel queries and scoped to the caller's company. The page
 * loader and every server action are gated to Company-Admin / Platform-Owner
 * (see requireCompanyAdmin in actions.ts); RLS independently enforces tenant
 * isolation on the reads below. The Section-Access tab loads per-entity on
 * demand via getFieldGovernanceAdmin, so it is not part of this bundle.
 */

export interface AuthzRole {
  key: string;
  name_ar: string | null;
}

export interface AuthzMember {
  id: string;
  name: string;
  roleKeys: string[];
}

export interface AuthzNamedEntity {
  id: string;
  name: string;
}

export interface AuthzConsoleData {
  /** The company's enabled roles (key + Arabic name), columns of the matrix. */
  roles: AuthzRole[];
  /** Company members with their display name and the role keys they hold. */
  members: AuthzMember[];
  /** roleKey → list of granted deny-all capability keys (the 8 P6 caps). */
  capabilityGrants: Record<string, string[]>;
  /** True when the grants come from the global baseline (no company config). */
  capabilityFromBaseline: boolean;
  branches: AuthzNamedEntity[];
  regions: AuthzNamedEntity[];
  areas: AuthzNamedEntity[];
  /** Declared per-assignment scope rows (P3). */
  scopeRows: ScopeRef[];
  /** Declared numeric authority rows (P4). */
  limitRows: RoleLimit[];
}

/** Load the full Authz Console bundle for the caller's company. */
export async function loadAuthzConsole(
  supabase: SupabaseClient,
  ctx: UserContext,
): Promise<AuthzConsoleData> {
  const companyId = ctx.companyId;
  if (!companyId) {
    return {
      roles: [], members: [], capabilityGrants: {}, capabilityFromBaseline: true,
      branches: [], regions: [], areas: [], scopeRows: [], limitRows: [],
    };
  }
  const caps = [...DENY_ALL_CAPABILITIES];

  // ── Enabled roles for the company (join erp_roles for name_ar). Fall back to
  //    system roles when the company has no erp_company_roles config. ──
  const [
    { data: companyRoles },
    { data: allRoles },
    { data: memberRows },
    { data: companyCaps },
    { data: branchRows },
    { data: regionRows },
    { data: areaRows },
    { data: scopeRaw },
    { data: limitRaw },
  ] = await Promise.all([
    supabase.from('erp_company_roles').select('role_key, enabled').eq('company_id', companyId),
    supabase.from('erp_roles').select('key, name_ar, is_system, rank').order('rank', { ascending: false }),
    // Members from the tenant-scoped visibility model (erp_visible_user_ids):
    // Company Admin → all tenant users; Supervisor → team; Area Manager → region;
    // Rep → self. SECURITY DEFINER RPC re-applies the scope, so no RLS is widened.
    supabase.rpc('erp_scoped_members'),
    supabase
      .from('erp_company_role_permissions')
      .select('role_key, permission')
      .eq('company_id', companyId)
      .in('permission', caps),
    supabase.from('erp_branches').select('id, name, name_ar, code').eq('company_id', companyId).order('code'),
    supabase.from('erp_regions').select('id, name, name_ar').eq('company_id', companyId).order('name'),
    supabase.from('erp_areas').select('id, name, name_ar').eq('company_id', companyId).order('name'),
    supabase.from('erp_role_scope').select('*').eq('company_id', companyId),
    supabase.from('erp_role_limits').select('*').eq('company_id', companyId),
  ]);

  const allRolesList = (allRoles ?? []) as Array<{ key: string; name_ar: string | null; is_system: boolean }>;
  const nameByKey = new Map(allRolesList.map((r) => [r.key, r.name_ar]));

  let roles: AuthzRole[];
  if (companyRoles && companyRoles.length > 0) {
    roles = (companyRoles as Array<{ role_key: string; enabled: boolean }>)
      .filter((r) => r.enabled)
      .map((r) => ({ key: r.role_key, name_ar: nameByKey.get(r.role_key) ?? null }));
  } else {
    roles = allRolesList.filter((r) => r.is_system).map((r) => ({ key: r.key, name_ar: r.name_ar }));
  }

  // ── Members: collapse the scoped-member rows (one per user/role) to one entry
  //    per user. Source = erp_scoped_members() RPC (flat user_id/role/name/email). ──
  const memberMap = new Map<string, AuthzMember>();
  for (const raw of (memberRows ?? []) as unknown as Array<{
    user_id: string;
    role: string;
    full_name: string | null;
    email: string | null;
  }>) {
    const existing = memberMap.get(raw.user_id);
    if (existing) {
      if (!existing.roleKeys.includes(raw.role)) existing.roleKeys.push(raw.role);
    } else {
      const name = raw.full_name?.trim() || raw.email || raw.user_id;
      memberMap.set(raw.user_id, { id: raw.user_id, name, roleKeys: [raw.role] });
    }
  }
  const members = [...memberMap.values()].sort((a, b) => a.name.localeCompare(b.name));

  // ── Capability grants: company-scoped config, else global baseline. ──
  let capabilityGrants: Record<string, string[]> = {};
  let capabilityFromBaseline = false;
  if (companyCaps && companyCaps.length > 0) {
    for (const r of companyCaps as Array<{ role_key: string; permission: string }>) {
      (capabilityGrants[r.role_key] ??= []).push(r.permission);
    }
  } else {
    // No company-scoped config at all → show the global baseline (display-only).
    const { data: globalCaps } = await supabase
      .from('erp_role_permissions')
      .select('role_key, permission')
      .in('permission', caps);
    capabilityFromBaseline = true;
    for (const r of (globalCaps ?? []) as Array<{ role_key: string; permission: string }>) {
      (capabilityGrants[r.role_key] ??= []).push(r.permission);
    }
  }

  const named = (rows: Array<{ id: string; name: string; name_ar: string | null }> | null): AuthzNamedEntity[] =>
    (rows ?? []).map((r) => ({ id: r.id, name: r.name_ar?.trim() || r.name }));

  const scopeRows = ((scopeRaw ?? []) as Array<Parameters<typeof toScopeRef>[0]>)
    .map(toScopeRef)
    .filter((s): s is ScopeRef => s !== null);

  const limitRows = ((limitRaw ?? []) as Array<Parameters<typeof toRoleLimit>[0]>).map(toRoleLimit);

  return {
    roles,
    members,
    capabilityGrants,
    capabilityFromBaseline,
    branches: named(branchRows as Array<{ id: string; name: string; name_ar: string | null }> | null),
    regions: named(regionRows as Array<{ id: string; name: string; name_ar: string | null }> | null),
    areas: named(areaRows as Array<{ id: string; name: string; name_ar: string | null }> | null),
    scopeRows,
    limitRows,
  };
}
