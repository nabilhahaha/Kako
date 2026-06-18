import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserContext } from './auth-context';
import { USER_ACCESS_OVERRIDES_ENABLED } from '@/lib/role-governance';

/**
 * User Access Overrides — server-only data loaders for the E4 admin console.
 *
 * Gated to Company-Admin / Platform-Owner (the page + every action enforce it);
 * RLS independently enforces tenant isolation on these reads. The feature is
 * default-OFF (KAKO_USER_ACCESS_OVERRIDES); `enabled` reflects that so the page
 * can render its inert state without exposing the editor.
 */

export interface OverrideMember {
  id: string;
  name: string;
  roleKeys: string[];
}

export interface AccessOverridesConsoleData {
  enabled: boolean;
  members: OverrideMember[];
}

export interface MemberOverrideState {
  /** operational permission → true if the member's ROLE baseline already grants it */
  baselineHas: Record<string, boolean>;
  /** the member's current overrides (operational only) */
  overrides: { permission: string; effect: 'grant' | 'revoke' }[];
}

/** True when the Platform Owner has entitled this company for user access
 *  overrides (reference/demo tenant first). Read-only; platform-owner-controlled. */
export async function companyHasAccessOverridesEntitlement(
  supabase: SupabaseClient,
  companyId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('erp_company_entitlements')
    .select('is_enabled')
    .eq('company_id', companyId)
    .eq('feature_key', 'platform.user_access_overrides')
    .eq('is_enabled', true)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

/** Members of the caller's company (collapsed to one entry per user). */
export async function loadAccessOverridesConsole(
  supabase: SupabaseClient,
  ctx: UserContext,
): Promise<AccessOverridesConsoleData> {
  // Enabled = global flag ON AND this company is entitled (per-tenant scope).
  const enabled =
    USER_ACCESS_OVERRIDES_ENABLED() &&
    !!ctx.companyId &&
    (await companyHasAccessOverridesEntitlement(supabase, ctx.companyId));
  if (!ctx.companyId || !enabled) return { enabled, members: [] };

  const { data: memberRows } = await supabase.rpc('erp_scoped_members');
  const memberMap = new Map<string, OverrideMember>();
  for (const raw of (memberRows ?? []) as unknown as Array<{
    user_id: string; role: string; full_name: string | null; email: string | null;
  }>) {
    const existing = memberMap.get(raw.user_id);
    if (existing) {
      if (!existing.roleKeys.includes(raw.role)) existing.roleKeys.push(raw.role);
    } else {
      memberMap.set(raw.user_id, {
        id: raw.user_id,
        name: raw.full_name?.trim() || raw.email || raw.user_id,
        roleKeys: [raw.role],
      });
    }
  }
  const members = [...memberMap.values()].sort((a, b) => a.name.localeCompare(b.name));
  return { enabled, members };
}

/** Resolve a member's ROLE permission baseline (company config authoritative,
 *  else global defaults) — mirrors the role resolution in auth-context. */
async function loadMemberRolePermissions(
  supabase: SupabaseClient,
  companyId: string,
  roleKeys: string[],
): Promise<Set<string>> {
  if (roleKeys.length === 0) return new Set();
  const { data: companyRoles } = await supabase
    .from('erp_company_roles')
    .select('role_key, enabled')
    .eq('company_id', companyId);

  if (companyRoles && companyRoles.length > 0) {
    const enabledKeys = (companyRoles as Array<{ role_key: string; enabled: boolean }>)
      .filter((r) => r.enabled && roleKeys.includes(r.role_key))
      .map((r) => r.role_key);
    if (enabledKeys.length === 0) return new Set();
    const { data: perms } = await supabase
      .from('erp_company_role_permissions')
      .select('permission')
      .eq('company_id', companyId)
      .in('role_key', enabledKeys);
    return new Set((perms ?? []).map((p) => p.permission as string));
  }
  const { data: perms } = await supabase
    .from('erp_role_permissions')
    .select('permission')
    .in('role_key', roleKeys);
  return new Set((perms ?? []).map((p) => p.permission as string));
}

/** Per-member state for the editor: role baseline (for the ✓/✗ badge) + current
 *  operational overrides. `delegable` is the operational permission set. */
export async function loadMemberOverrideState(
  supabase: SupabaseClient,
  companyId: string,
  userId: string,
  roleKeys: string[],
  delegable: readonly string[],
): Promise<MemberOverrideState> {
  const [baseline, { data: ovRows }] = await Promise.all([
    loadMemberRolePermissions(supabase, companyId, roleKeys),
    supabase
      .from('erp_temporary_access_grants')
      .select('grant_key, effect')
      .eq('company_id', companyId)
      .eq('user_id', userId)
      .eq('kind', 'override')
      .is('expired_at', null),
  ]);
  const baselineHas: Record<string, boolean> = {};
  for (const p of delegable) baselineHas[p] = baseline.has(p);
  const overrides = (ovRows ?? [])
    .map((r) => ({ permission: r.grant_key as string, effect: r.effect as 'grant' | 'revoke' }))
    .filter((o) => (delegable as readonly string[]).includes(o.permission));
  return { baselineHas, overrides };
}
