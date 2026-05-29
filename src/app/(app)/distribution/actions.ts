'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requirePermission, friendlyDbError, type ActionResult } from '@/lib/erp/guards';

/** Set a rep's monthly sales target + commission %. month = 'YYYY-MM'. */
export async function setTarget(input: { user_id: string; month: string; target_amount: number; commission_pct: number }): Promise<ActionResult> {
  const ctx = await requirePermission('reports.view');
  if (!ctx.companyId) return { ok: false, error: 'يتم من داخل حساب الشركة.' };
  if (!input.user_id || !/^\d{4}-\d{2}$/.test(input.month)) return { ok: false, error: 'بيانات غير صحيحة.' };
  const supabase = await createClient();
  const { error } = await supabase.from('erp_rep_targets').upsert({
    company_id: ctx.companyId,
    user_id: input.user_id,
    month: `${input.month}-01`,
    target_amount: Number.isFinite(input.target_amount) && input.target_amount >= 0 ? input.target_amount : 0,
    commission_pct: Number.isFinite(input.commission_pct) && input.commission_pct >= 0 ? input.commission_pct : 0,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'company_id,user_id,month' });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/distribution/targets');
  revalidatePath('/distribution/report');
  return { ok: true };
}
