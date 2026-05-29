'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { logAudit } from '@/lib/erp/audit';

// Per-company role & permission management. Restricted to the platform owner:
// they decide which roles are active and what each role can do for every tenant
// company, independently (a pharmacy != a food distributor != a hotel).

async function requirePlatformOwner() {
  const ctx = await getUserContext();
  if (!ctx) return { ctx: null, error: 'غير مصرح. سجّل الدخول.' };
  if (!ctx.isPlatformOwner)
    return { ctx: null, error: 'إدارة صلاحيات الشركات متاحة لمالك المنصّة فقط.' };
  return { ctx, error: null };
}

function revalidateCompany(companyId: string) {
  revalidatePath(`/platform/companies/${companyId}`);
}

/** Enable or disable a role for a specific company. */
export async function setCompanyRoleEnabled(
  companyId: string,
  roleKey: string,
  enabled: boolean,
): Promise<ActionResult> {
  const { error: authErr } = await requirePlatformOwner();
  if (authErr) return { ok: false, error: authErr };
  if (!companyId || !roleKey) return { ok: false, error: 'بيانات غير مكتملة.' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('erp_company_roles')
    .upsert(
      { company_id: companyId, role_key: roleKey, enabled },
      { onConflict: 'company_id,role_key' },
    );
  if (error) return { ok: false, error: friendlyDbError(error) };

  // First time a role is turned on for a company with no permissions yet:
  // seed it from the global defaults so it isn't empty.
  if (enabled) {
    const { count } = await supabase
      .from('erp_company_role_permissions')
      .select('permission', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('role_key', roleKey);
    if ((count ?? 0) === 0) {
      const { data: defaults } = await supabase
        .from('erp_role_permissions')
        .select('permission')
        .eq('role_key', roleKey);
      const rows = (defaults ?? []).map((d) => ({
        company_id: companyId,
        role_key: roleKey,
        permission: d.permission as string,
      }));
      if (rows.length > 0) {
        await supabase
          .from('erp_company_role_permissions')
          .upsert(rows, { onConflict: 'company_id,role_key,permission' });
      }
    }
  }

  await logAudit(supabase, {
    action: enabled ? 'enable' : 'disable',
    entity: 'company_role',
    entityId: roleKey,
    companyId,
  });
  revalidateCompany(companyId);
  return { ok: true };
}

/** Grant or revoke a single permission for a role within a company. */
export async function setCompanyRolePermission(
  companyId: string,
  roleKey: string,
  permission: string,
  enabled: boolean,
): Promise<ActionResult> {
  const { error: authErr } = await requirePlatformOwner();
  if (authErr) return { ok: false, error: authErr };
  if (!companyId || !roleKey || !permission)
    return { ok: false, error: 'بيانات غير مكتملة.' };

  const supabase = await createClient();
  if (enabled) {
    const { error } = await supabase
      .from('erp_company_role_permissions')
      .upsert(
        { company_id: companyId, role_key: roleKey, permission },
        { onConflict: 'company_id,role_key,permission' },
      );
    if (error) return { ok: false, error: friendlyDbError(error) };
  } else {
    const { error } = await supabase
      .from('erp_company_role_permissions')
      .delete()
      .eq('company_id', companyId)
      .eq('role_key', roleKey)
      .eq('permission', permission);
    if (error) return { ok: false, error: friendlyDbError(error) };
  }

  await logAudit(supabase, {
    action: enabled ? 'grant' : 'revoke',
    entity: 'company_role_permission',
    entityId: roleKey,
    details: { permission },
    companyId,
  });
  revalidateCompany(companyId);
  return { ok: true };
}

/**
 * Add a new role to the catalog and enable it for this company. The role key
 * lives in the global catalog (so it can be reused), but it is only active for
 * companies that enable it.
 */
export async function addCompanyRole(
  companyId: string,
  name_ar: string,
  key: string,
): Promise<ActionResult> {
  const { error: authErr } = await requirePlatformOwner();
  if (authErr) return { ok: false, error: authErr };
  if (!companyId) return { ok: false, error: 'الشركة مطلوبة.' };

  const cleanKey = key.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
  if (!cleanKey) return { ok: false, error: 'مفتاح الدور (إنجليزي) مطلوب.' };
  if (!name_ar.trim()) return { ok: false, error: 'اسم الدور مطلوب.' };

  const supabase = await createClient();
  // Add to the catalog if it does not exist yet (keep any existing name/rank).
  const { error: roleErr } = await supabase
    .from('erp_roles')
    .upsert(
      { key: cleanKey, name_ar: name_ar.trim(), is_system: false, rank: 1 },
      { onConflict: 'key', ignoreDuplicates: true },
    );
  if (roleErr) return { ok: false, error: friendlyDbError(roleErr) };

  // Enable it for this company (starts with no permissions — set them in the matrix).
  const { error: enableErr } = await supabase
    .from('erp_company_roles')
    .upsert(
      { company_id: companyId, role_key: cleanKey, enabled: true },
      { onConflict: 'company_id,role_key' },
    );
  if (enableErr) return { ok: false, error: friendlyDbError(enableErr) };

  await logAudit(supabase, {
    action: 'create',
    entity: 'company_role',
    entityId: cleanKey,
    details: { name_ar: name_ar.trim() },
    companyId,
  });
  revalidateCompany(companyId);
  return { ok: true };
}
