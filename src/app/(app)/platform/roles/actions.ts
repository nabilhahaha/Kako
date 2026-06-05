'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { logAudit } from '@/lib/erp/audit';
import { getT } from '@/lib/i18n/server';
import { validateRoleKey, slugifyRoleKey, sanitizePermissions, permissionDiff } from '@/lib/erp/role-admin';

// The GLOBAL role catalog (erp_roles / erp_role_permissions) seeds every new
// company. Owner-only writes (RLS enforces owner|super-admin since 0152; we also
// guard here for a friendly message + audit). All mutations audited.
async function requireOwner() {
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) return { ctx: null, error: t('platform.errors.unauthorized') };
  if (!ctx.isPlatformOwner) return { ctx: null, error: t('platform.errors.ownerRequired') };
  return { ctx, error: null };
}

function revalidate() {
  revalidatePath('/platform/roles');
  revalidatePath('/settings/permissions');
}

export async function createRole(nameAr: string, key: string): Promise<ActionResult> {
  const { ctx, error } = await requireOwner();
  if (error || !ctx) return { ok: false, error: error! };
  const { t } = await getT();
  const cleanKey = slugifyRoleKey(key);
  if (!nameAr.trim()) return { ok: false, error: t('platform.roles.errNameRequired') };
  const supabase = await createClient();
  const { data: existing } = await supabase.from('erp_roles').select('key');
  const keys = ((existing ?? []) as { key: string }[]).map((r) => r.key);
  if (!validateRoleKey(cleanKey, keys).ok) return { ok: false, error: t('platform.roles.errKey') };
  const { error: e } = await supabase.from('erp_roles').insert({ key: cleanKey, name_ar: nameAr.trim(), is_system: false, rank: 1 });
  if (e) return { ok: false, error: friendlyDbError(e) };
  await logAudit(supabase, { action: 'create', entity: 'role', entityId: cleanKey, details: { name_ar: nameAr.trim() } });
  revalidate();
  return { ok: true };
}

export async function renameRole(key: string, nameAr: string): Promise<ActionResult> {
  const { ctx, error } = await requireOwner();
  if (error || !ctx) return { ok: false, error: error! };
  const { t } = await getT();
  if (!nameAr.trim()) return { ok: false, error: t('platform.roles.errNameRequired') };
  const supabase = await createClient();
  const { error: e } = await supabase.from('erp_roles').update({ name_ar: nameAr.trim() }).eq('key', key);
  if (e) return { ok: false, error: friendlyDbError(e) };
  await logAudit(supabase, { action: 'update', entity: 'role', entityId: key, details: { name_ar: nameAr.trim() } });
  revalidate();
  return { ok: true };
}

export async function deleteRole(key: string): Promise<ActionResult> {
  const { ctx, error } = await requireOwner();
  if (error || !ctx) return { ok: false, error: error! };
  const { t } = await getT();
  const supabase = await createClient();
  const { data: role } = await supabase.from('erp_roles').select('is_system').eq('key', key).maybeSingle();
  if ((role as { is_system?: boolean } | null)?.is_system) return { ok: false, error: t('platform.roles.errSystemRole') };
  const { error: e } = await supabase.from('erp_roles').delete().eq('key', key);
  if (e) return { ok: false, error: friendlyDbError(e) };
  await logAudit(supabase, { action: 'delete', entity: 'role', entityId: key });
  revalidate();
  return { ok: true };
}

export async function cloneRole(srcKey: string, newKey: string, newNameAr: string): Promise<ActionResult> {
  const { ctx, error } = await requireOwner();
  if (error || !ctx) return { ok: false, error: error! };
  const { t } = await getT();
  const cleanKey = slugifyRoleKey(newKey);
  if (!newNameAr.trim()) return { ok: false, error: t('platform.roles.errNameRequired') };
  const supabase = await createClient();
  const { data: existing } = await supabase.from('erp_roles').select('key');
  const keys = ((existing ?? []) as { key: string }[]).map((r) => r.key);
  if (!validateRoleKey(cleanKey, keys).ok) return { ok: false, error: t('platform.roles.errKey') };
  const { error: e1 } = await supabase.from('erp_roles').insert({ key: cleanKey, name_ar: newNameAr.trim(), is_system: false, rank: 1 });
  if (e1) return { ok: false, error: friendlyDbError(e1) };
  const { data: perms } = await supabase.from('erp_role_permissions').select('permission').eq('role_key', srcKey);
  const rows = sanitizePermissions(((perms ?? []) as { permission: string }[]).map((p) => p.permission))
    .map((permission) => ({ role_key: cleanKey, permission }));
  if (rows.length) {
    const { error: e2 } = await supabase.from('erp_role_permissions').insert(rows);
    if (e2) return { ok: false, error: friendlyDbError(e2) };
  }
  await logAudit(supabase, { action: 'create', entity: 'role', entityId: cleanKey, details: { cloned_from: srcKey, permissions: rows.length } });
  revalidate();
  return { ok: true };
}

/** Single permission toggle (matrix cell). */
export async function setRolePermission(roleKey: string, permission: string, enabled: boolean): Promise<ActionResult> {
  const { ctx, error } = await requireOwner();
  if (error || !ctx) return { ok: false, error: error! };
  const supabase = await createClient();
  if (enabled) {
    const { error: e } = await supabase.from('erp_role_permissions').upsert({ role_key: roleKey, permission }, { onConflict: 'role_key,permission' });
    if (e) return { ok: false, error: friendlyDbError(e) };
  } else {
    const { error: e } = await supabase.from('erp_role_permissions').delete().eq('role_key', roleKey).eq('permission', permission);
    if (e) return { ok: false, error: friendlyDbError(e) };
  }
  await logAudit(supabase, { action: enabled ? 'grant' : 'revoke', entity: 'role_permission', entityId: roleKey, details: { permission } });
  revalidate();
  return { ok: true };
}

/** Replace a role's whole permission set (diffed insert/delete). */
export async function setRolePermissions(roleKey: string, permissions: string[]): Promise<ActionResult> {
  const { ctx, error } = await requireOwner();
  if (error || !ctx) return { ok: false, error: error! };
  const supabase = await createClient();
  const next = sanitizePermissions(permissions);
  const { data: current } = await supabase.from('erp_role_permissions').select('permission').eq('role_key', roleKey);
  const cur = ((current ?? []) as { permission: string }[]).map((r) => r.permission);
  const { added, removed } = permissionDiff(cur, next);
  if (removed.length) {
    const { error: e } = await supabase.from('erp_role_permissions').delete().eq('role_key', roleKey).in('permission', removed);
    if (e) return { ok: false, error: friendlyDbError(e) };
  }
  if (added.length) {
    const { error: e } = await supabase.from('erp_role_permissions').insert(added.map((permission) => ({ role_key: roleKey, permission })));
    if (e) return { ok: false, error: friendlyDbError(e) };
  }
  await logAudit(supabase, { action: 'update', entity: 'role_permission', entityId: roleKey, details: { added, removed } });
  revalidate();
  return { ok: true };
}
