'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { logAudit } from '@/lib/erp/audit';
import { notifyManagers } from '@/lib/erp/notify';
import { getActionPolicy } from '@/lib/erp/action-policy';
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
  /** BL-6: client-generated UUID, stable per submit attempt, so a double-click /
   *  retry is a no-op in erp_settle_collection instead of a duplicate receipt +
   *  double balance reduction. */
  idempotencyKey?: string | null;
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
    p_idempotency_key: input.idempotencyKey ?? null,
    p_collection_date: input.date || null,
  });
  if (error) return { ok: false, error: error.message };
  // Critical-action audit: collection.post (irreversible — undone by a reversal voucher).
  await logAudit(supabase, {
    action: 'create', entity: 'collection',
    details: { customer_id: input.customerId, branch_id: input.branchId, amount, method: input.method || 'cash', collection_date: input.date || null },
    companyId: ctx.companyId,
  });
  revalidatePath('/collections');
  return { ok: true };
}

/**
 * Reverse a posted collection (collection.adjust / reversal). Consumes the
 * tenant ACTION POLICY (erp_action_policies) — blocked when the action is
 * disabled for the company — rather than hard-coded rules. The atomic
 * erp_reverse_collection RPC unwinds allocations + restores balances; this
 * wrapper enforces the permission, the policy, audits, and notifies managers.
 *
 * AUTHORITY (SoD): reversing a posted collection is a FINANCE/ADMIN correction —
 * it is NOT the same right as recording a collection. It requires
 * `accounting.post` (held by Finance/Accountant; admins/managers hold ALL).
 * A Sales Rep (sales.collect) can record collections but CANNOT reverse them.
 */
export async function reverseCollection(collectionId: string, reason?: string): Promise<ActionResult> {
  const ctx = await getUserContext();
  const { t } = await getT();
  if (!ctx) return { ok: false, error: t('sales.collectionsErrUnauthorized') };
  if (!hasPermission(ctx, 'accounting.post'))
    return { ok: false, error: t('sales.collectionsErrUnauthorized') };
  if (!collectionId) return { ok: false, error: t('sales.collectionsErrUnauthorized') };

  const supabase = await createClient();
  // Policy engine: respect the tenant's enable/disable for this action.
  const policy = await getActionPolicy(supabase, ctx.companyId, 'collection.adjust');
  if (!policy.enabled) return { ok: false, error: t('actionPolicies.disabledForTenant') };
  if (policy.reasonRequired && !reason?.trim()) return { ok: false, error: t('actionPolicies.reasonRequiredErr') };

  const { data, error } = await supabase.rpc('erp_reverse_collection', {
    p_collection_id: collectionId,
    p_reason: reason?.trim() || null,
  });
  if (error) return { ok: false, error: error.message };
  const res = (data ?? {}) as { reversed?: number; customer_id?: string };

  await logAudit(supabase, {
    action: 'update', entity: 'collection', entityId: collectionId,
    details: { event: 'collection_reversed', reversed: res.reversed ?? null, reason: reason?.trim() || null },
    companyId: ctx.companyId,
  });
  await notifyManagers(supabase, ctx.companyId, {
    type: 'critical_action',
    titleAr: 'عكس تحصيل', titleEn: 'Collection reversed',
    body: reason?.trim() || '', link: '/collections', entity: 'collection', recordId: collectionId,
  });
  revalidatePath('/collections');
  revalidatePath('/customers');
  return { ok: true };
}
