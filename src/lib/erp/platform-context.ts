import { createClient } from '@/lib/supabase/server';
import {
  expandPlatformPermissions,
  isPlatformRole,
  type PlatformPermission,
  type PlatformRole,
} from './platform-permissions';

/** ── Platform (vendor-side) staff context ──────────────────────────────────
 *  Resolves the signed-in user's platform standing: are they the Owner, an
 *  active internal employee, what role, and which granular permissions. Effective
 *  permissions come from the DB resolver `erp_platform_my_permissions()` (owner ⇒
 *  every permission). Mirrors the tenant `getUserContext()` pattern. */

export interface PlatformContext {
  userId: string;
  isOwner: boolean;
  /** Owner OR an active internal employee. */
  isStaff: boolean;
  role: PlatformRole | null;
  permissions: PlatformPermission[];
}

export async function getPlatformContext(): Promise<PlatformContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: staff }, { data: perms }] = await Promise.all([
    supabase.from('erp_profiles').select('is_platform_owner').eq('id', user.id).maybeSingle(),
    supabase.from('erp_platform_staff').select('role, is_active').eq('profile_id', user.id).maybeSingle(),
    supabase.rpc('erp_platform_my_permissions'),
  ]);

  const isOwner = Boolean((profile as { is_platform_owner?: boolean } | null)?.is_platform_owner);
  const activeStaff = staff as { role: string; is_active: boolean } | null;
  const isActiveStaff = Boolean(activeStaff?.is_active);
  const isStaff = isOwner || isActiveStaff;
  if (!isStaff) return { userId: user.id, isOwner, isStaff: false, role: null, permissions: [] };

  const role = !isOwner && activeStaff && isPlatformRole(activeStaff.role) ? activeStaff.role : null;
  const permissions = expandPlatformPermissions(Array.isArray(perms) ? (perms as string[]) : []);
  return { userId: user.id, isOwner, isStaff, role, permissions };
}

export function hasPlatformPermission(
  ctx: Pick<PlatformContext, 'isOwner' | 'permissions'> | null,
  perm: PlatformPermission,
): boolean {
  if (!ctx) return false;
  return ctx.isOwner || ctx.permissions.includes(perm);
}
