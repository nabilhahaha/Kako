'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requirePlatform, requirePlatformOwner } from '@/lib/erp/platform-guards';
import { isPlatformRole, isPlatformPermission } from '@/lib/erp/platform-permissions';

/** ── Platform Staff Management — server actions ────────────────────────────
 *  Owner invites new employees (creates the auth account); owner OR a
 *  manage_users employee manages existing ones (role, overrides, offboarding).
 *  All permission/staff changes are audit-logged by DB triggers (migration
 *  0083). Offboarding also bans the auth login via an edge function. */

interface Result { ok: boolean; error?: string }

/** Invite a new internal employee: create the auth user, then the staff row.
 *  OWNER-only (creating an auth account is an ownership-level action). */
export async function createStaff(formData: FormData): Promise<Result> {
  const { ctx, error } = await requirePlatformOwner();
  if (!ctx) return { ok: false, error };

  const email = String(formData.get('email') || '').trim().toLowerCase();
  const password = String(formData.get('password') || '');
  const full_name = String(formData.get('full_name') || '').trim();
  const role = String(formData.get('role') || '').trim();
  const title = String(formData.get('title') || '').trim() || null;
  if (!email) return { ok: false, error: 'email required' };
  if (password.length < 6) return { ok: false, error: 'password too short' };
  if (!isPlatformRole(role)) return { ok: false, error: 'invalid role' };

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const { data, error: fnErr } = await supabase.functions.invoke('admin-create-user', {
    body: { email, password, full_name },
    headers: session ? { Authorization: `Bearer ${session.access_token}` } : undefined,
  });
  if (fnErr) return { ok: false, error: 'could not create user' };
  if (data?.error) return { ok: false, error: data.error };
  const userId = data?.user_id as string | undefined;
  if (!userId) return { ok: false, error: 'user id missing' };

  const { error: insErr } = await supabase
    .from('erp_platform_staff')
    .insert({ profile_id: userId, role, title, created_by: ctx.userId });
  if (insErr) return { ok: false, error: insErr.message };

  revalidatePath('/platform/staff');
  return { ok: true };
}

/** Change an employee's role. Owner or manage_users (escalation trigger bounds
 *  what a non-owner can assign). */
export async function setStaffRole(staffId: string, role: string): Promise<Result> {
  const { ctx, error } = await requirePlatform('manage_users');
  if (!ctx) return { ok: false, error };
  if (!isPlatformRole(role)) return { ok: false, error: 'invalid role' };
  const supabase = await createClient();
  const { error: e } = await supabase
    .from('erp_platform_staff')
    .update({ role, updated_at: new Date().toISOString() })
    .eq('id', staffId);
  if (e) return { ok: false, error: e.message };
  revalidatePath('/platform/staff');
  return { ok: true };
}

/** Set or clear a per-employee permission override. effect=null clears it.
 *  Owner or manage_users (the grant guard bounds non-owners). */
export async function setStaffOverride(
  staffId: string,
  permission: string,
  effect: 'grant' | 'deny' | null,
): Promise<Result> {
  const { ctx, error } = await requirePlatform('manage_users');
  if (!ctx) return { ok: false, error };
  if (!isPlatformPermission(permission)) return { ok: false, error: 'invalid permission' };
  const supabase = await createClient();
  if (effect === null) {
    const { error: e } = await supabase
      .from('erp_platform_staff_permissions')
      .delete()
      .eq('staff_id', staffId)
      .eq('permission', permission);
    if (e) return { ok: false, error: e.message };
  } else {
    const { error: e } = await supabase
      .from('erp_platform_staff_permissions')
      .upsert({ staff_id: staffId, permission, effect }, { onConflict: 'staff_id,permission' });
    if (e) return { ok: false, error: e.message };
  }
  revalidatePath('/platform/staff');
  return { ok: true };
}

/** Offboard (active=false) or reactivate (active=true) an employee. Disables the
 *  platform layer (is_active) AND the auth login + sessions (edge function).
 *  Customer/tenant data is never touched. Owner or manage_users. */
export async function setStaffActive(staffId: string, active: boolean): Promise<Result> {
  const { ctx, error } = await requirePlatform('manage_users');
  if (!ctx) return { ok: false, error };
  const supabase = await createClient();

  const { data: row, error: selErr } = await supabase
    .from('erp_platform_staff')
    .select('profile_id')
    .eq('id', staffId)
    .single();
  if (selErr || !row) return { ok: false, error: selErr?.message ?? 'staff not found' };
  const profileId = (row as { profile_id: string }).profile_id;

  const { error: updErr } = await supabase
    .from('erp_platform_staff')
    .update({
      is_active: active,
      disabled_at: active ? null : new Date().toISOString(),
      disabled_by: active ? null : ctx.userId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', staffId);
  if (updErr) return { ok: false, error: updErr.message };

  // Disable/enable the auth login + revoke sessions (best-effort; the platform
  // flag above already revokes platform access regardless).
  const { data: { session } } = await supabase.auth.getSession();
  await supabase.functions.invoke('admin-set-user-active', {
    body: { user_id: profileId, active },
    headers: session ? { Authorization: `Bearer ${session.access_token}` } : undefined,
  });

  revalidatePath('/platform/staff');
  return { ok: true };
}
