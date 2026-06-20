'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { logAudit } from '@/lib/erp/audit';
import {
  isDelegableOperationalPermission,
  DELEGABLE_OPERATIONAL_PERMISSIONS,
  ROLE_PERMISSION_OVERRIDES_ENABLED,
} from '@/lib/role-governance';
import { companyHasAccessOverridesEntitlement } from '@/lib/erp/access-overrides-server';
import {
  loadRoleOverrideState,
  ROLE_OVERRIDES_FEATURE_KEY,
  type RoleOverrideState,
} from '@/lib/erp/role-overrides-server';

/**
 * Role Permission Overrides — write API (R2).
 *
 * SECURITY: every write is gated by requireCompanyAdmin() (Company Admin /
 * Platform Owner / Super Admin) AND the feature gate (flag
 * KAKO_ROLE_PERMISSION_OVERRIDES AND per-company entitlement). The target
 * permission must be a delegable OPERATIONAL permission (allowlist − deny-list),
 * independently enforced at the DB (RLS WITH CHECK + erp_is_delegable_permission).
 * Tenant isolation: writes stamp company_id; the client company is never trusted.
 * A reason is mandatory. Every mutation is audited. Role overrides are stored on
 * the existing engine with kind='role_override' (user_id NULL, role_key set).
 */

interface AdminGuard {
  ok: true;
  companyId: string;
  userId: string;
  isPlatformOwner: boolean;
  permissions: string[];
  supabase: Awaited<ReturnType<typeof createClient>>;
}

async function requireCompanyAdmin(): Promise<AdminGuard | { ok: false; error: string }> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error: 'unauthorized' };
  const isAdmin =
    ctx.isPlatformOwner === true || ctx.isSuperAdmin === true || ctx.memberships.some((m) => m.role === 'admin');
  if (!isAdmin || !ctx.companyId) return { ok: false, error: 'unauthorized' };
  const supabase = await createClient();
  // Feature gate: global flag AND per-company entitlement.
  if (!ROLE_PERMISSION_OVERRIDES_ENABLED() || !(await companyHasAccessOverridesEntitlement(supabase, ctx.companyId, ROLE_OVERRIDES_FEATURE_KEY))) {
    return { ok: false, error: 'feature_not_enabled' };
  }
  return {
    ok: true,
    companyId: ctx.companyId,
    userId: ctx.userId,
    isPlatformOwner: ctx.isPlatformOwner === true || ctx.isSuperAdmin === true,
    permissions: ctx.permissions as string[],
    supabase,
  };
}

const REVALIDATE = '/settings/role-overrides';

function validReason(reason: string): boolean {
  return typeof reason === 'string' && reason.trim().length > 0;
}

/** Grant or revoke one delegable operational permission for an entire role. */
export async function setRolePermissionOverride(
  roleKey: string,
  permission: string,
  effect: 'grant' | 'revoke',
  reason: string,
): Promise<ActionResult> {
  const g = await requireCompanyAdmin();
  if (!g.ok) return { ok: false, error: g.error };
  if (!roleKey) return { ok: false, error: 'invalid_role' };
  if (effect !== 'grant' && effect !== 'revoke') return { ok: false, error: 'invalid_effect' };
  if (!isDelegableOperationalPermission(permission)) return { ok: false, error: 'permission_not_delegable' };
  if (!validReason(reason)) return { ok: false, error: 'reason_required' };
  // Defense in depth: a non-owner admin may only grant a permission they hold.
  if (effect === 'grant' && !g.isPlatformOwner && !g.permissions.includes(permission)) {
    return { ok: false, error: 'cannot_grant_unheld_permission' };
  }
  const { supabase, companyId, userId } = g;

  await supabase
    .from('erp_temporary_access_grants')
    .delete()
    .eq('company_id', companyId)
    .eq('kind', 'role_override')
    .eq('role_key', roleKey)
    .eq('grant_key', permission);
  const { error } = await supabase.from('erp_temporary_access_grants').insert({
    company_id: companyId,
    user_id: null,
    role_key: roleKey,
    grant_key: permission,
    kind: 'role_override',
    effect,
    effective_from: null,
    effective_to: null,
    expired_at: null,
    reason: reason.trim(),
    granted_by: userId,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };

  await logAudit(supabase, {
    action: effect,
    entity: 'role_permission_override',
    entityId: roleKey,
    companyId,
    details: { role: roleKey, permission, effect, reason: reason.trim() },
  });
  revalidatePath(REVALIDATE);
  return { ok: true };
}

/** Clear one role override (return the role to default for that permission). */
export async function clearRolePermissionOverride(roleKey: string, permission: string): Promise<ActionResult> {
  const g = await requireCompanyAdmin();
  if (!g.ok) return { ok: false, error: g.error };
  const { supabase, companyId } = g;
  const { error } = await supabase
    .from('erp_temporary_access_grants')
    .delete()
    .eq('company_id', companyId)
    .eq('kind', 'role_override')
    .eq('role_key', roleKey)
    .eq('grant_key', permission);
  if (error) return { ok: false, error: friendlyDbError(error) };
  await logAudit(supabase, {
    action: 'delete', entity: 'role_permission_override', entityId: roleKey, companyId,
    details: { role: roleKey, permission, reset: true },
  });
  revalidatePath(REVALIDATE);
  return { ok: true };
}

/** Reset ALL overrides for a role (back to its default). */
export async function resetRolePermissionOverrides(roleKey: string): Promise<ActionResult> {
  const g = await requireCompanyAdmin();
  if (!g.ok) return { ok: false, error: g.error };
  const { supabase, companyId } = g;
  const { data: cleared, error } = await supabase
    .from('erp_temporary_access_grants')
    .delete()
    .eq('company_id', companyId)
    .eq('kind', 'role_override')
    .eq('role_key', roleKey)
    .select('grant_key');
  if (error) return { ok: false, error: friendlyDbError(error) };
  await logAudit(supabase, {
    action: 'delete', entity: 'role_permission_override', entityId: roleKey, companyId,
    details: { role: roleKey, reset_all: true, cleared: (cleared ?? []).map((r) => r.grant_key as string) },
  });
  revalidatePath(REVALIDATE);
  return { ok: true };
}

/** Clone one role's overrides onto a set of target roles. */
export async function cloneRolePermissionOverrides(
  sourceRole: string,
  targetRoles: string[],
  reason: string,
): Promise<{ ok: true; applied: number } | { ok: false; error: string }> {
  const g = await requireCompanyAdmin();
  if (!g.ok) return { ok: false, error: g.error };
  if (!sourceRole) return { ok: false, error: 'invalid_source' };
  const targets = [...new Set((targetRoles ?? []).filter((r) => r && r !== sourceRole))];
  if (targets.length === 0) return { ok: false, error: 'no_targets' };
  if (!validReason(reason)) return { ok: false, error: 'reason_required' };
  const { supabase, companyId, userId, isPlatformOwner, permissions } = g;

  const { data: srcRows, error: srcErr } = await supabase
    .from('erp_temporary_access_grants')
    .select('grant_key, effect')
    .eq('company_id', companyId)
    .eq('kind', 'role_override')
    .eq('role_key', sourceRole)
    .is('expired_at', null);
  if (srcErr) return { ok: false, error: friendlyDbError(srcErr) };
  const src = (srcRows ?? [])
    .map((r) => ({ permission: r.grant_key as string, effect: r.effect as 'grant' | 'revoke' }))
    .filter((o) => isDelegableOperationalPermission(o.permission))
    .filter((o) => o.effect === 'revoke' || isPlatformOwner || permissions.includes(o.permission));
  if (src.length === 0) return { ok: false, error: 'no_delegable_overrides' };

  const reasonTrim = reason.trim();
  const keys = src.map((o) => o.permission);
  let applied = 0;
  for (const target of targets) {
    await supabase
      .from('erp_temporary_access_grants')
      .delete()
      .eq('company_id', companyId)
      .eq('kind', 'role_override')
      .eq('role_key', target)
      .in('grant_key', keys);
    const rows = src.map((o) => ({
      company_id: companyId, user_id: null, role_key: target, grant_key: o.permission,
      kind: 'role_override', effect: o.effect, effective_from: null, effective_to: null,
      expired_at: null, reason: reasonTrim, granted_by: userId,
    }));
    const { error } = await supabase.from('erp_temporary_access_grants').insert(rows);
    if (error) return { ok: false, error: friendlyDbError(error) };
    applied += 1;
    await logAudit(supabase, {
      action: 'update', entity: 'role_permission_override', entityId: target, companyId,
      details: { cloned_from: sourceRole, role: target, permissions: src.map((o) => `${o.effect}:${o.permission}`), reason: reasonTrim },
    });
  }
  revalidatePath(REVALIDATE);
  return { ok: true, applied };
}

/** Load a role's editor state (baseline + current overrides). */
export async function loadRoleOverrideStateAction(
  roleKey: string,
): Promise<{ ok: true; state: RoleOverrideState } | { ok: false; error: string }> {
  const g = await requireCompanyAdmin();
  if (!g.ok) return { ok: false, error: g.error };
  const state = await loadRoleOverrideState(g.supabase, g.companyId, roleKey, DELEGABLE_OPERATIONAL_PERMISSIONS);
  return { ok: true, state };
}
