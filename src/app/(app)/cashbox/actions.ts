'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requirePermission, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { getT } from '@/lib/i18n/server';
import { logAudit } from '@/lib/erp/audit';

/**
 * Generic Shift / Cashbox actions — the business-agnostic counterpart of the
 * fashion cashbox. They reuse the company-scoped cash-session RPCs
 * (erp_fashion_open_cashbox / _add_expense / _close_cashbox), which authorize by
 * tenant membership (not by the "fashion" name). Operating the office Cash Box is a
 * TREASURY function gated by `treasury.manage` (Cashier/Accountant/Admin) — NOT
 * `sales.collect` — so field reps cannot open/close the till. Every write is
 * mirrored to the audit log via
 * logAudit, and the close action returns a printable receipt href so the
 * Critical Action standard can offer the "Print now?" step.
 */

/** Resolve the caller's working branch (prefer HQ, else first active). */
async function resolveBranch(companyId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('erp_branches').select('id, is_hq')
    .eq('company_id', companyId).eq('is_active', true)
    .order('is_hq', { ascending: false }).order('code').limit(1);
  return (data?.[0] as { id: string } | undefined)?.id ?? null;
}

export async function openShift(openingFloat: number): Promise<ActionResult> {
  const { t } = await getT();
  const ctx = await requirePermission('treasury.manage');
  if (!ctx.companyId) return { ok: false, error: t('cashbox.noCompany') };
  const branchId = await resolveBranch(ctx.companyId);
  if (!branchId) return { ok: false, error: friendlyDbError({ message: 'no branch' }) };

  const supabase = await createClient();
  const { error } = await supabase.rpc('erp_fashion_open_cashbox', {
    p_branch_id: branchId,
    p_opening_float: Number(openingFloat) || 0,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  await logAudit(supabase, {
    action: 'create', entity: 'cash_session',
    details: { event: 'open_shift', opening_float: Number(openingFloat) || 0 },
    companyId: ctx.companyId,
  });
  revalidatePath('/cashbox');
  return { ok: true };
}

export async function postExpense(input: {
  category: string; amount: number; note?: string | null; reason?: string | null;
}): Promise<ActionResult> {
  const { t } = await getT();
  const ctx = await requirePermission('treasury.manage');
  if (!ctx.companyId) return { ok: false, error: t('cashbox.noCompany') };
  const amount = Number(input.amount);
  if (!amount || amount <= 0) return { ok: false, error: t('cashbox.amount') };
  const branchId = await resolveBranch(ctx.companyId);
  if (!branchId) return { ok: false, error: friendlyDbError({ message: 'no branch' }) };

  const supabase = await createClient();
  const note = [input.note?.trim(), input.reason?.trim() ? `(${input.reason.trim()})` : null]
    .filter(Boolean).join(' ') || null;
  const { error } = await supabase.rpc('erp_fashion_add_expense', {
    p_branch_id: branchId,
    p_category: input.category?.trim() || null,
    p_amount: amount,
    p_paid_from: 'cash',
    p_note: note,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  await logAudit(supabase, {
    action: 'create', entity: 'expense',
    details: { event: 'post_expense', category: input.category, amount, reason: input.reason ?? null },
    companyId: ctx.companyId,
  });
  revalidatePath('/cashbox');
  return { ok: true };
}

export async function closeShift(input: {
  sessionId: string; counted: number; reason?: string | null;
}): Promise<ActionResult<{ expected: number; counted: number; variance: number; printHref: string }>> {
  const { t } = await getT();
  const ctx = await requirePermission('treasury.manage');
  if (!ctx.companyId) return { ok: false, error: t('cashbox.noCompany') };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('erp_fashion_close_cashbox', {
    p_session_id: input.sessionId,
    p_counted: Number(input.counted) || 0,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  const res = (data ?? {}) as { expected: number; counted: number; variance: number };
  await logAudit(supabase, {
    action: 'update', entity: 'cash_session', entityId: input.sessionId,
    details: {
      event: 'close_shift',
      expected: res.expected, counted: res.counted, variance: res.variance,
      reason: input.reason ?? null,
    },
    companyId: ctx.companyId,
  });
  revalidatePath('/cashbox');
  return {
    ok: true,
    data: { ...res, printHref: `/print/shift/${input.sessionId}` },
  };
}
