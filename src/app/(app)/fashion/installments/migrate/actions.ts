'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, friendlyDbError, type ActionResult } from '@/lib/erp/guards';

/** Import an existing (old) installment contract: creates a migrated plan with a
 *  remaining schedule and raises the customer's receivable. */
export async function importInstallmentContract(input: {
  customerId: string;
  branchId: string | null;
  total: number;
  remaining: number;
  remainingCount: number;
  frequency: 'weekly' | 'biweekly' | 'monthly';
  firstDue: string | null;
  reference: string | null;
  contractDate: string | null;
}): Promise<ActionResult<{ count: number }>> {
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };
  if (!input.customerId) return { ok: false, error: 'اختر عميلاً.' };
  if (!(input.remaining > 0)) return { ok: false, error: 'المبلغ المتبقي يجب أن يكون أكبر من صفر.' };
  if (!(input.remainingCount >= 1)) return { ok: false, error: 'عدد الأقساط يجب أن يكون 1 أو أكثر.' };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('erp_import_installment_contract', {
    p_customer_id: input.customerId,
    p_branch_id: input.branchId,
    p_total_amount: input.total || input.remaining,
    p_remaining_amount: input.remaining,
    p_remaining_count: input.remainingCount,
    p_frequency: input.frequency,
    p_first_due_date: input.firstDue,
    p_reference: input.reference,
    p_contract_date: input.contractDate,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/fashion/installments/migrate');
  revalidatePath('/fashion/installments');
  return { ok: true, data: { count: (data as { installments?: number })?.installments ?? input.remainingCount } };
}

export async function reverseMigratedInstallment(planId: string): Promise<ActionResult> {
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };
  const supabase = await createClient();
  const { error } = await supabase.rpc('erp_reverse_migrated_installment', { p_plan_id: planId });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/fashion/installments/migrate');
  revalidatePath('/fashion/installments');
  return { ok: true };
}
