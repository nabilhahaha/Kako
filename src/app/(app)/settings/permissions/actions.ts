'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { logAudit } from '@/lib/erp/audit';

async function requireSuperAdmin() {
  const { ctx } = await requireAuth();
  if (!ctx) return { ctx: null, error: 'غير مصرح.' };
  if (!ctx.isSuperAdmin) return { ctx: null, error: 'إدارة الصلاحيات متاحة لمدير النظام فقط.' };
  return { ctx, error: null };
}

export async function setRolePermission(
  roleKey: string,
  permission: string,
  enabled: boolean,
): Promise<ActionResult> {
  const { error: authErr } = await requireSuperAdmin();
  if (authErr) return { ok: false, error: authErr };

  const supabase = await createClient();
  if (enabled) {
    const { error } = await supabase
      .from('erp_role_permissions')
      .upsert({ role_key: roleKey, permission }, { onConflict: 'role_key,permission' });
    if (error) return { ok: false, error: friendlyDbError(error) };
  } else {
    const { error } = await supabase
      .from('erp_role_permissions')
      .delete()
      .eq('role_key', roleKey)
      .eq('permission', permission);
    if (error) return { ok: false, error: friendlyDbError(error) };
  }
  await logAudit(supabase, {
    action: enabled ? 'grant' : 'revoke',
    entity: 'role_permission',
    entityId: roleKey,
    details: { permission },
  });
  revalidatePath('/settings/permissions');
  return { ok: true };
}

export async function createRole(name_ar: string, key: string): Promise<ActionResult> {
  const { error: authErr } = await requireSuperAdmin();
  if (authErr) return { ok: false, error: authErr };

  const cleanKey = key.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
  if (!cleanKey) return { ok: false, error: 'مفتاح الدور (إنجليزي) مطلوب.' };
  if (!name_ar.trim()) return { ok: false, error: 'اسم الدور مطلوب.' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('erp_roles')
    .insert({ key: cleanKey, name_ar: name_ar.trim(), is_system: false, rank: 1 });
  if (error) return { ok: false, error: friendlyDbError(error) };
  await logAudit(supabase, { action: 'create', entity: 'role', entityId: cleanKey, details: { name_ar: name_ar.trim() } });
  revalidatePath('/settings/permissions');
  revalidatePath('/settings/users');
  return { ok: true };
}

export async function deleteRole(key: string): Promise<ActionResult> {
  const { error: authErr } = await requireSuperAdmin();
  if (authErr) return { ok: false, error: authErr };

  const supabase = await createClient();
  const { data: role } = await supabase.from('erp_roles').select('is_system').eq('key', key).maybeSingle();
  if (role?.is_system) return { ok: false, error: 'لا يمكن حذف دور أساسي.' };

  const { error } = await supabase.from('erp_roles').delete().eq('key', key);
  if (error) return { ok: false, error: friendlyDbError(error) };
  await logAudit(supabase, { action: 'delete', entity: 'role', entityId: key });
  revalidatePath('/settings/permissions');
  revalidatePath('/settings/users');
  return { ok: true };
}
