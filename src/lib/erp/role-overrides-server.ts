import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserContext } from './auth-context';
import { ROLE_PERMISSION_OVERRIDES_ENABLED } from '@/lib/role-governance';
import { companyHasAccessOverridesEntitlement } from './access-overrides-server';

/**
 * Role Permission Overrides — server-only loaders for the R3 admin console.
 * Gated to Company-Admin / Platform-Owner (page + actions enforce it); RLS
 * enforces tenant isolation. Enabled = flag KAKO_ROLE_PERMISSION_OVERRIDES AND
 * per-company entitlement platform.role_permission_overrides.
 */

export const ROLE_OVERRIDES_FEATURE_KEY = 'platform.role_permission_overrides';

export interface OverrideRole {
  key: string;
  nameAr: string | null;
}

export interface RoleOverridesConsoleData {
  enabled: boolean;
  roles: OverrideRole[];
}

export interface RoleOverrideState {
  /** operational permission → true if the role baseline already grants it */
  baselineHas: Record<string, boolean>;
  /** the role's current overrides (operational only) */
  overrides: { permission: string; effect: 'grant' | 'revoke' }[];
}

/** The company's roles (enabled company roles, else system roles). */
export async function loadRoleOverridesConsole(
  supabase: SupabaseClient,
  ctx: UserContext,
): Promise<RoleOverridesConsoleData> {
  const enabled =
    ROLE_PERMISSION_OVERRIDES_ENABLED() &&
    !!ctx.companyId &&
    (await companyHasAccessOverridesEntitlement(supabase, ctx.companyId, ROLE_OVERRIDES_FEATURE_KEY));
  if (!ctx.companyId || !enabled) return { enabled, roles: [] };

  const [{ data: companyRoles }, { data: allRoles }] = await Promise.all([
    supabase.from('erp_company_roles').select('role_key, enabled').eq('company_id', ctx.companyId),
    supabase.from('erp_roles').select('key, name_ar, is_system, rank').order('rank', { ascending: false }),
  ]);
  const nameByKey = new Map((allRoles ?? []).map((r) => [r.key as string, (r.name_ar as string | null) ?? null]));
  let roles: OverrideRole[];
  if (companyRoles && companyRoles.length > 0) {
    roles = (companyRoles as Array<{ role_key: string; enabled: boolean }>)
      .filter((r) => r.enabled)
      .map((r) => ({ key: r.role_key, nameAr: nameByKey.get(r.role_key) ?? null }));
  } else {
    roles = (allRoles ?? [])
      .filter((r) => r.is_system)
      .map((r) => ({ key: r.key as string, nameAr: (r.name_ar as string | null) ?? null }));
  }
  return { enabled, roles };
}

/** Resolve a role's permission baseline (company config authoritative, else
 *  global defaults) — mirrors role resolution in auth-context. */
async function loadRolePermissions(
  supabase: SupabaseClient,
  companyId: string,
  roleKey: string,
): Promise<Set<string>> {
  const { data: companyRoles } = await supabase
    .from('erp_company_roles')
    .select('role_key, enabled')
    .eq('company_id', companyId);
  if (companyRoles && companyRoles.length > 0) {
    const enabled = (companyRoles as Array<{ role_key: string; enabled: boolean }>)
      .some((r) => r.enabled && r.role_key === roleKey);
    if (!enabled) return new Set();
    const { data: perms } = await supabase
      .from('erp_company_role_permissions')
      .select('permission')
      .eq('company_id', companyId)
      .eq('role_key', roleKey);
    return new Set((perms ?? []).map((p) => p.permission as string));
  }
  const { data: perms } = await supabase
    .from('erp_role_permissions')
    .select('permission')
    .eq('role_key', roleKey);
  return new Set((perms ?? []).map((p) => p.permission as string));
}

/** Per-role editor state: baseline (✓/✗ badge) + current operational overrides. */
export async function loadRoleOverrideState(
  supabase: SupabaseClient,
  companyId: string,
  roleKey: string,
  delegable: readonly string[],
): Promise<RoleOverrideState> {
  const [baseline, { data: ovRows }] = await Promise.all([
    loadRolePermissions(supabase, companyId, roleKey),
    supabase
      .from('erp_temporary_access_grants')
      .select('grant_key, effect')
      .eq('company_id', companyId)
      .eq('kind', 'role_override')
      .eq('role_key', roleKey)
      .is('expired_at', null),
  ]);
  const baselineHas: Record<string, boolean> = {};
  for (const p of delegable) baselineHas[p] = baseline.has(p);
  const overrides = (ovRows ?? [])
    .map((r) => ({ permission: r.grant_key as string, effect: r.effect as 'grant' | 'revoke' }))
    .filter((o) => (delegable as readonly string[]).includes(o.permission));
  return { baselineHas, overrides };
}
