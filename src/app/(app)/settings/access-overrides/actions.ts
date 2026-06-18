'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { logAudit } from '@/lib/erp/audit';
import {
  isDelegableOperationalPermission,
  effectivePermissionsDiff,
  DELEGABLE_OPERATIONAL_PERMISSIONS,
  type AccessOverride,
} from '@/lib/role-governance';
import {
  loadMemberOverrideState,
  companyHasAccessOverridesEntitlement,
  type MemberOverrideState,
} from '@/lib/erp/access-overrides-server';
import { USER_ACCESS_OVERRIDES_ENABLED } from '@/lib/role-governance';

/**
 * User Access Overrides — write API (E3).
 *
 * SECURITY (critical): every write is gated by requireCompanyAdmin() (Company
 * Admin / Platform Owner / Super Admin), AND the target permission must be a
 * delegable OPERATIONAL permission (allowlist − immutable deny-list). The same
 * delegability is independently enforced at the database layer (RLS WITH CHECK +
 * erp_is_delegable_permission), so the server action and the DB agree. Tenant
 * isolation: writes stamp company_id = ctx.companyId; the client company is never
 * trusted. A reason is mandatory. Every mutation is audited.
 *
 * Overrides are stored on the existing erp_temporary_access_grants engine with
 * kind='override' and a NULL window (permanent). The resolver applies them only
 * when KAKO_USER_ACCESS_OVERRIDES is enabled (default OFF) — this API never
 * enables the feature; it only records overrides.
 */

interface AdminGuard {
  ok: true;
  companyId: string;
  userId: string;
  isPlatformOwner: boolean;
  permissions: string[];
  supabase: Awaited<ReturnType<typeof createClient>>;
}

/** Company-Admin / Platform-Owner / Super-Admin only. */
async function requireCompanyAdmin(): Promise<AdminGuard | { ok: false; error: string }> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error: 'unauthorized' };
  const isAdmin =
    ctx.isPlatformOwner === true ||
    ctx.isSuperAdmin === true ||
    ctx.memberships.some((m) => m.role === 'admin');
  if (!isAdmin || !ctx.companyId) return { ok: false, error: 'unauthorized' };
  const supabase = await createClient();
  // Feature gate: global flag ON AND this company is entitled (reference tenant
  // first). Non-entitled companies cannot create/modify overrides at all.
  if (!USER_ACCESS_OVERRIDES_ENABLED() || !(await companyHasAccessOverridesEntitlement(supabase, ctx.companyId))) {
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

const REVALIDATE = '/settings/access-overrides';

function validReason(reason: string): boolean {
  return typeof reason === 'string' && reason.trim().length > 0;
}

/** Grant or revoke one delegable operational permission for a specific user. */
export async function setUserAccessOverride(
  targetUserId: string,
  permission: string,
  effect: 'grant' | 'revoke',
  reason: string,
): Promise<ActionResult> {
  const g = await requireCompanyAdmin();
  if (!g.ok) return { ok: false, error: g.error };
  if (!targetUserId) return { ok: false, error: 'invalid_user' };
  if (effect !== 'grant' && effect !== 'revoke') return { ok: false, error: 'invalid_effect' };
  if (!isDelegableOperationalPermission(permission)) return { ok: false, error: 'permission_not_delegable' };
  if (!validReason(reason)) return { ok: false, error: 'reason_required' };
  // Defense in depth: a non-owner admin may only grant a permission they hold.
  if (effect === 'grant' && !g.isPlatformOwner && !g.permissions.includes(permission)) {
    return { ok: false, error: 'cannot_grant_unheld_permission' };
  }
  const { supabase, companyId, userId } = g;

  // One override row per (company, user, permission): clear any existing override
  // for this key, then insert. (The table allows repeated keys for legacy
  // temporary grants, so we scope the delete to kind='override'.)
  await supabase
    .from('erp_temporary_access_grants')
    .delete()
    .eq('company_id', companyId)
    .eq('user_id', targetUserId)
    .eq('kind', 'override')
    .eq('grant_key', permission);
  const { error } = await supabase
    .from('erp_temporary_access_grants')
    .insert({
      company_id: companyId,
      user_id: targetUserId,
      grant_key: permission,
      kind: 'override',
      effect,
      effective_from: null,
      effective_to: null,
      expired_at: null,
      reason: reason.trim(),
      granted_by: userId,
    });
  if (error) return { ok: false, error: friendlyDbError(error) };

  await logAudit(supabase, {
    action: effect, // 'grant' | 'revoke' (bilingual labels already exist)
    entity: 'user_access_override',
    entityId: targetUserId,
    companyId,
    details: { permission, effect, reason: reason.trim() },
  });
  revalidatePath(REVALIDATE);
  return { ok: true };
}

/** Clear one override (return the user to the role default for that permission). */
export async function clearUserAccessOverride(
  targetUserId: string,
  permission: string,
): Promise<ActionResult> {
  const g = await requireCompanyAdmin();
  if (!g.ok) return { ok: false, error: g.error };
  const { supabase, companyId, userId } = g;

  const { error } = await supabase
    .from('erp_temporary_access_grants')
    .delete()
    .eq('company_id', companyId)
    .eq('user_id', targetUserId)
    .eq('kind', 'override')
    .eq('grant_key', permission);
  if (error) return { ok: false, error: friendlyDbError(error) };

  await logAudit(supabase, {
    action: 'delete',
    entity: 'user_access_override',
    entityId: targetUserId,
    companyId,
    details: { permission, reset: true },
  });
  revalidatePath(REVALIDATE);
  return { ok: true };
}

/** Reset ALL overrides for a user (back to their role default). */
export async function resetUserAccessOverrides(targetUserId: string): Promise<ActionResult> {
  const g = await requireCompanyAdmin();
  if (!g.ok) return { ok: false, error: g.error };
  const { supabase, companyId } = g;

  const { data: cleared, error } = await supabase
    .from('erp_temporary_access_grants')
    .delete()
    .eq('company_id', companyId)
    .eq('user_id', targetUserId)
    .eq('kind', 'override')
    .select('grant_key');
  if (error) return { ok: false, error: friendlyDbError(error) };

  await logAudit(supabase, {
    action: 'delete',
    entity: 'user_access_override',
    entityId: targetUserId,
    companyId,
    details: { reset_all: true, cleared: (cleared ?? []).map((r) => r.grant_key as string) },
  });
  revalidatePath(REVALIDATE);
  return { ok: true };
}

export interface EffectivePermissionsDiff {
  baseline: string[];
  effective: string[];
  addedByGrant: string[];
  removedByRevoke: string[];
}

/** Effective-permissions diff for a user: role baseline vs. effective, showing the
 *  operational grants/revokes that explain the difference. Read-only. */
export async function getEffectivePermissionsDiff(
  targetUserId: string,
  baseline: readonly string[],
): Promise<{ ok: true; diff: EffectivePermissionsDiff } | { ok: false; error: string }> {
  const g = await requireCompanyAdmin();
  if (!g.ok) return { ok: false, error: g.error };
  const { supabase, companyId } = g;

  const { data: rows, error } = await supabase
    .from('erp_temporary_access_grants')
    .select('grant_key, effect')
    .eq('company_id', companyId)
    .eq('user_id', targetUserId)
    .eq('kind', 'override')
    .is('expired_at', null);
  if (error) return { ok: false, error: friendlyDbError(error) };

  const overrides: AccessOverride[] = (rows ?? []).map((r) => ({
    permission: r.grant_key as string,
    effect: r.effect as 'grant' | 'revoke',
  }));
  return { ok: true, diff: effectivePermissionsDiff(baseline, overrides) };
}

/** Load a member's editor state (role baseline + current operational overrides).
 *  Used by the console when an admin selects a user. */
export async function loadMemberOverrideStateAction(
  targetUserId: string,
  roleKeys: string[],
): Promise<{ ok: true; state: MemberOverrideState } | { ok: false; error: string }> {
  const g = await requireCompanyAdmin();
  if (!g.ok) return { ok: false, error: g.error };
  const state = await loadMemberOverrideState(
    g.supabase, g.companyId, targetUserId, roleKeys ?? [], DELEGABLE_OPERATIONAL_PERMISSIONS,
  );
  return { ok: true, state };
}

/** Override templates / cloning: copy one user's operational overrides onto a set
 *  of target users. Only delegable operational overrides are copied (re-validated),
 *  each application is audited, and a mandatory reason is required. */
export async function cloneUserAccessOverrides(
  sourceUserId: string,
  targetUserIds: string[],
  reason: string,
): Promise<{ ok: true; applied: number } | { ok: false; error: string }> {
  const g = await requireCompanyAdmin();
  if (!g.ok) return { ok: false, error: g.error };
  if (!sourceUserId) return { ok: false, error: 'invalid_source' };
  const targets = [...new Set((targetUserIds ?? []).filter((id) => id && id !== sourceUserId))];
  if (targets.length === 0) return { ok: false, error: 'no_targets' };
  if (!validReason(reason)) return { ok: false, error: 'reason_required' };
  const { supabase, companyId, userId, isPlatformOwner, permissions } = g;

  // Source overrides — operational only.
  const { data: srcRows, error: srcErr } = await supabase
    .from('erp_temporary_access_grants')
    .select('grant_key, effect')
    .eq('company_id', companyId)
    .eq('user_id', sourceUserId)
    .eq('kind', 'override')
    .is('expired_at', null);
  if (srcErr) return { ok: false, error: friendlyDbError(srcErr) };

  const src = (srcRows ?? [])
    .map((r) => ({ permission: r.grant_key as string, effect: r.effect as 'grant' | 'revoke' }))
    .filter((o) => isDelegableOperationalPermission(o.permission))
    // a non-owner admin may only clone GRANTS for permissions they personally hold
    .filter((o) => o.effect === 'revoke' || isPlatformOwner || permissions.includes(o.permission));
  if (src.length === 0) return { ok: false, error: 'no_delegable_overrides' };

  const reasonTrim = reason.trim();
  const keys = src.map((o) => o.permission);
  let applied = 0;
  for (const target of targets) {
    const rows = src.map((o) => ({
      company_id: companyId, user_id: target, grant_key: o.permission,
      kind: 'override', effect: o.effect, effective_from: null, effective_to: null,
      expired_at: null, reason: reasonTrim, granted_by: userId,
    }));
    // Replace the cloned keys on the target (leave the target's other overrides intact).
    await supabase
      .from('erp_temporary_access_grants')
      .delete()
      .eq('company_id', companyId)
      .eq('user_id', target)
      .eq('kind', 'override')
      .in('grant_key', keys);
    const { error } = await supabase.from('erp_temporary_access_grants').insert(rows);
    if (error) return { ok: false, error: friendlyDbError(error) };
    applied += 1;
    await logAudit(supabase, {
      action: 'update',
      entity: 'user_access_override',
      entityId: target,
      companyId,
      details: { cloned_from: sourceUserId, permissions: src.map((o) => `${o.effect}:${o.permission}`), reason: reasonTrim },
    });
  }
  revalidatePath(REVALIDATE);
  return { ok: true, applied };
}
