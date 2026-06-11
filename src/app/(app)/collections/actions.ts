'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { getT } from '@/lib/i18n/server';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Record a collection against a customer's outstanding balance. Authorization is
 * triple-guarded: the caller must hold `sales.collect` (checked here), the
 * `erp_settle_collection` RPC runs the allocation safely, and RLS scopes the
 * customer/branch to the caller's tenant. The customer's own branch is used —
 * the client cannot target another branch/tenant.
 */
export async function recordCollection(input: {
  customerId: string;
  branchId: string;
  amount: number;
  method: string;
  date?: string | null;
}): Promise<ActionResult> {
  const ctx = await getUserContext();
  const { t } = await getT();
  if (!ctx) return { ok: false, error: t('sales.collectionsErrUnauthorized') };
  if (!(ctx.permissions as string[]).includes('sales.collect'))
    return { ok: false, error: t('sales.collectionsErrUnauthorized') };
  const amount = Number(input.amount);
  if (!amount || amount <= 0) return { ok: false, error: t('sales.collectionsErrAmount') };

  const supabase = await createClient();
  const { error } = await supabase.rpc('erp_settle_collection', {
    p_branch_id: input.branchId,
    p_customer_id: input.customerId,
    p_amount: amount,
    p_method: input.method || 'cash',
    p_reference: null,
    p_specified: null,
    p_idempotency_key: null,
    p_collection_date: input.date || null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/collections');
  return { ok: true };
}
