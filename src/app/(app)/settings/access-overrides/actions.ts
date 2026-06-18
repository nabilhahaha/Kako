'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { logAudit } from '@/lib/erp/audit';
import {
  isDelegableOperationalPermission,
  effectivePermissionsDiff,
  type AccessOverride,
} from '@/lib/role-governance';

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
  return {
    ok: true,
    companyId: ctx.companyId,
    userId: ctx.userId,
    isPlatformOwner: ctx.isPlatformOwner === true || ctx.isSuperAdmin === true,
    permissions: ctx.permissions as string[],
    supabase: await createClient(),
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

  const { error } = await supabase
    .from('erp_temporary_access_grants')
    .upsert(
      {
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
      },
      { onConflict: 'company_id,user_id,grant_key' },
    );
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
