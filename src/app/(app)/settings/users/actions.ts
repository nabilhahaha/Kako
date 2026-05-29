'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { checkUserLimit } from '@/lib/erp/plans';
import { logAudit } from '@/lib/erp/audit';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

async function requireSuperAdmin() {
  const ctx = await getUserContext();
  if (!ctx) return { ctx: null, error: 'غير مصرح. سجّل الدخول.' };
  if (!ctx.isSuperAdmin)
    return { ctx: null, error: 'هذه العملية متاحة لمدير النظام فقط.' };
  return { ctx, error: null };
}

/** Creates a new auth user via the admin-create-user edge function. */
export async function createUser(formData: FormData): Promise<ActionResult> {
  const { ctx, error: authErr } = await requireSuperAdmin();
  if (authErr || !ctx) return { ok: false, error: authErr ?? 'غير مصرح' };

  const email = String(formData.get('email') || '').trim().toLowerCase();
  const password = String(formData.get('password') || '');
  const full_name = String(formData.get('full_name') || '').trim();

  if (!email) return { ok: false, error: 'البريد الإلكتروني مطلوب.' };
  if (password.length < 6)
    return { ok: false, error: 'كلمة المرور يجب أن تكون ٦ أحرف على الأقل.' };

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const { data, error } = await supabase.functions.invoke('admin-create-user', {
    body: { email, password, full_name },
    headers: session
      ? { Authorization: `Bearer ${session.access_token}` }
      : undefined,
  });

  if (error) {
    return {
      ok: false,
      error:
        'تعذّر إنشاء المستخدم. تأكد من نشر دالة admin-create-user على Supabase.',
    };
  }
  if (data?.error) return { ok: false, error: data.error };

  await logAudit(supabase, {
    action: 'create',
    entity: 'user',
    entityId: (data?.user_id as string) ?? null,
    details: { email },
    companyId: ctx.companyId,
  });
  revalidatePath('/settings/users');
  return { ok: true };
}

export async function assignBranch(
  userId: string,
  branchId: string,
  role: string,
  reportsTo?: string | null,
): Promise<ActionResult> {
  const { error: authErr } = await requireSuperAdmin();
  if (authErr) return { ok: false, error: authErr };
  if (!branchId) return { ok: false, error: 'اختر الفرع.' };

  const supabase = await createClient();

  // Enforce the company's plan user limit (a user already in the company is
  // exempt — e.g. assigning an existing member to an additional branch).
  const { data: branch } = await supabase
    .from('erp_branches')
    .select('company_id')
    .eq('id', branchId)
    .maybeSingle();
  const companyId = (branch as { company_id?: string } | null)?.company_id;
  if (companyId) {
    const limitErr = await checkUserLimit(supabase, companyId, userId);
    if (limitErr) return { ok: false, error: limitErr };
  }

  const { error } = await supabase
    .from('erp_user_branches')
    .upsert(
      { user_id: userId, branch_id: branchId, role, reports_to: reportsTo || null },
      { onConflict: 'user_id,branch_id' },
    );

  if (error) return { ok: false, error: error.message };
  await logAudit(supabase, {
    action: 'create',
    entity: 'assignment',
    entityId: userId,
    details: { branch_id: branchId, role },
    companyId: companyId ?? null,
  });
  revalidatePath('/settings/users');
  return { ok: true };
}

export async function removeAssignment(
  userId: string,
  branchId: string,
): Promise<ActionResult> {
  const { error: authErr } = await requireSuperAdmin();
  if (authErr) return { ok: false, error: authErr };

  const supabase = await createClient();
  const { error } = await supabase
    .from('erp_user_branches')
    .delete()
    .eq('user_id', userId)
    .eq('branch_id', branchId);

  if (error) return { ok: false, error: error.message };
  await logAudit(supabase, { action: 'delete', entity: 'assignment', entityId: userId, details: { branch_id: branchId } });
  revalidatePath('/settings/users');
  return { ok: true };
}

export async function setUserFlags(
  userId: string,
  flags: { is_active?: boolean; is_super_admin?: boolean },
): Promise<ActionResult> {
  const { ctx, error: authErr } = await requireSuperAdmin();
  if (authErr || !ctx) return { ok: false, error: authErr ?? 'غير مصرح' };

  // Guard: a super admin cannot strip their own super-admin/active flags.
  if (userId === ctx.userId) {
    return { ok: false, error: 'لا يمكنك تعديل صلاحيات حسابك الخاص.' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('erp_profiles')
    .update(flags)
    .eq('id', userId);

  if (error) return { ok: false, error: error.message };
  await logAudit(supabase, { action: 'update', entity: 'user_flags', entityId: userId, details: flags });
  revalidatePath('/settings/users');
  return { ok: true };
}
