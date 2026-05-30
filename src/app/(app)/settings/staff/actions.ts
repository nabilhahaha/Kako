'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserContext, type UserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { checkUserLimit } from '@/lib/erp/plans';
import { logAudit } from '@/lib/erp/audit';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

// Company-admin staff management: a tenant admin/manager manages their OWN
// company's staff (create, role, active, password) — scoped to their company
// by the caller's branches (RLS) and the SECURITY DEFINER helpers in 0050.

async function requireManager(): Promise<
  { ctx: UserContext; error: null } | { ctx: null; error: string }
> {
  const ctx = await getUserContext();
  if (!ctx) return { ctx: null, error: 'غير مصرح. سجّل الدخول.' };
  if (!hasPermission(ctx, 'settings.users'))
    return { ctx: null, error: 'هذه الصفحة متاحة لمدير الشركة فقط.' };
  if (!ctx.companyId)
    return { ctx: null, error: 'إدارة فريق العمل تتم من داخل حساب الشركة.' };
  if (ctx.company && ctx.company.allow_self_users === false)
    return { ctx: null, error: 'إدارة مستخدمي هذه الشركة يتولاها مزوّد الخدمة.' };
  return { ctx, error: null };
}

function defaultBranchId(ctx: UserContext): string | null {
  const m = ctx.memberships.find((x) => x.is_default) ?? ctx.memberships[0];
  return m?.branch.id ?? null;
}

/** Create a staff account and attach it to the caller's company branch. */
export async function createStaff(formData: FormData): Promise<ActionResult> {
  const { ctx, error: authErr } = await requireManager();
  if (authErr || !ctx) return { ok: false, error: authErr ?? 'غير مصرح' };

  const email = String(formData.get('email') || '').trim().toLowerCase();
  const password = String(formData.get('password') || '');
  const full_name = String(formData.get('full_name') || '').trim();
  const role = String(formData.get('role') || '').trim();

  if (!email) return { ok: false, error: 'البريد الإلكتروني مطلوب.' };
  if (password.length < 6) return { ok: false, error: 'كلمة المرور يجب أن تكون ٦ أحرف على الأقل.' };
  if (!role) return { ok: false, error: 'اختر الدور الوظيفي.' };

  const branchId = defaultBranchId(ctx);
  if (!branchId) return { ok: false, error: 'لا يوجد فرع مرتبط بحسابك.' };

  const supabase = await createClient();

  const limitErr = await checkUserLimit(supabase, ctx.companyId!);
  if (limitErr) return { ok: false, error: limitErr };

  const { data: { session } } = await supabase.auth.getSession();
  const { data, error } = await supabase.functions.invoke('admin-create-user', {
    body: { email, password, full_name },
    headers: session ? { Authorization: `Bearer ${session.access_token}` } : undefined,
  });
  if (error) return { ok: false, error: 'تعذّر إنشاء المستخدم. تأكد من نشر دالة admin-create-user.' };
  if (data?.error) return { ok: false, error: data.error };

  const userId = data?.user_id as string | undefined;
  if (userId) {
    const { error: asgErr } = await supabase
      .from('erp_user_branches')
      .upsert({ user_id: userId, branch_id: branchId, role, is_default: true }, { onConflict: 'user_id,branch_id' });
    if (asgErr) return { ok: false, error: `أُنشئ الحساب لكن تعذّر ربطه بالفرع: ${asgErr.message}` };
    await logAudit(supabase, { action: 'create', entity: 'user', entityId: userId, details: { email, role }, companyId: ctx.companyId });
  }

  revalidatePath('/settings/staff');
  return { ok: true };
}

/** Change a same-company member's role on the caller's branches. */
export async function setStaffRole(userId: string, role: string): Promise<ActionResult> {
  const { ctx, error: authErr } = await requireManager();
  if (authErr || !ctx) return { ok: false, error: authErr ?? 'غير مصرح' };
  if (!role) return { ok: false, error: 'اختر الدور.' };
  if (userId === ctx.userId) return { ok: false, error: 'لا يمكنك تغيير دور حسابك الخاص.' };

  const branchIds = ctx.memberships.map((m) => m.branch.id);
  if (branchIds.length === 0) return { ok: false, error: 'لا يوجد فرع مرتبط بحسابك.' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('erp_user_branches')
    .update({ role })
    .eq('user_id', userId)
    .in('branch_id', branchIds);
  if (error) return { ok: false, error: error.message };
  await logAudit(supabase, { action: 'update', entity: 'staff_role', entityId: userId, details: { role }, companyId: ctx.companyId });
  revalidatePath('/settings/staff');
  return { ok: true };
}

export async function setStaffActive(userId: string, active: boolean): Promise<ActionResult> {
  const { ctx, error: authErr } = await requireManager();
  if (authErr || !ctx) return { ok: false, error: authErr ?? 'غير مصرح' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('erp_set_staff_active', { p_user_id: userId, p_active: active });
  if (error) return { ok: false, error: error.message };
  await logAudit(supabase, { action: 'update', entity: 'staff_active', entityId: userId, details: { active }, companyId: ctx.companyId });
  revalidatePath('/settings/staff');
  return { ok: true };
}

export async function resetStaffPassword(userId: string, password: string): Promise<ActionResult> {
  const { ctx, error: authErr } = await requireManager();
  if (authErr || !ctx) return { ok: false, error: authErr ?? 'غير مصرح' };
  if (password.length < 6) return { ok: false, error: 'كلمة المرور يجب أن تكون ٦ أحرف على الأقل.' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('erp_set_staff_password', { p_user_id: userId, p_new_password: password });
  if (error) return { ok: false, error: error.message };
  await logAudit(supabase, { action: 'update', entity: 'staff_password', entityId: userId, details: {}, companyId: ctx.companyId });
  return { ok: true };
}
