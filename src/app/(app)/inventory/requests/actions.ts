'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { hasPermission } from '@/lib/erp/permissions';
import { APPROVAL_LOADREQ } from '@/lib/erp/approval-flags';
import { logAudit } from '@/lib/erp/audit';
import { getT } from '@/lib/i18n/server';

interface RequestInput {
  branch_id: string;
  from_warehouse_id: string;
  to_warehouse_id: string;
  notes?: string;
  lines: Array<{ product_id: string; quantity: number }>;
}

/** Rep raises a stock-load request from a source warehouse into a van. */
export async function createStockRequest(input: RequestInput): Promise<ActionResult> {
  const { ctx, error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };
  const { t } = await getT();
  if (!input.from_warehouse_id || !input.to_warehouse_id)
    return { ok: false, error: t('inventory.errorSelectSourceAndVan') };
  if (input.from_warehouse_id === input.to_warehouse_id)
    return { ok: false, error: t('inventory.errorSameSourceDest') };
  const lines = input.lines.filter((l) => l.product_id && l.quantity > 0);
  if (lines.length === 0) return { ok: false, error: t('inventory.errorAtLeastOneItem') };

  const supabase = await createClient();
  const { data: number, error: numErr } = await supabase.rpc('erp_next_number', {
    p_branch_id: input.branch_id,
    p_seq_type: 'van_load',
  });
  if (numErr) return { ok: false, error: friendlyDbError(numErr) };

  const { data: req, error: rErr } = await supabase
    .from('erp_stock_requests')
    .insert({
      request_number: number as string,
      branch_id: input.branch_id,
      from_warehouse_id: input.from_warehouse_id,
      to_warehouse_id: input.to_warehouse_id,
      status: 'pending',
      notes: input.notes?.trim() || null,
      requested_by: ctx!.userId,
    })
    .select('id')
    .single();
  if (rErr) return { ok: false, error: friendlyDbError(rErr) };

  const { error: lErr } = await supabase.from('erp_stock_request_lines').insert(
    lines.map((l) => ({ request_id: req.id, product_id: l.product_id, quantity: l.quantity })),
  );
  if (lErr) {
    await supabase.from('erp_stock_requests').delete().eq('id', req.id);
    return { ok: false, error: friendlyDbError(lErr) };
  }

  // P2 (flag KAKO_APPROVAL_LOADREQ): route approval through the engine,
  // branch-scoped to the rep's branch. If the start fails the request is still
  // valid and approvable via the legacy screen, so we don't roll it back. Flag
  // OFF ⇒ this is skipped entirely (legacy behaviour).
  if (APPROVAL_LOADREQ()) {
    await supabase.rpc('erp_workflow_start', {
      p_key: 'stock_request_approval', p_entity: 'stock_request',
      p_record_id: req.id, p_context: { branch_id: input.branch_id },
    });
  }

  revalidatePath('/inventory/requests');
  return { ok: true };
}

/** Warehouse / admin adjusts the approved loading date BEFORE approval. The
 *  original requested_date is preserved; the change is fully audited (who / when /
 *  note) — no silent date changes. */
export async function setStockRequestLoadingDate(input: { id: string; date: string; note?: string }): Promise<ActionResult> {
  const { ctx, error: authErr } = await requireAuth();
  if (authErr || !ctx) return { ok: false, error: authErr ?? 'unauthorized' };
  const { t } = await getT();
  if (!hasPermission(ctx, 'stock_request.approve')) return { ok: false, error: t('settings.unauthorized') };
  if (!input.id || !input.date) return { ok: false, error: t('inventory.errorAtLeastOneItem') };

  const supabase = await createClient();
  const { data: cur } = await supabase.from('erp_stock_requests').select('requested_date, approved_date, status').eq('id', input.id).maybeSingle();
  const row = cur as { requested_date: string | null; approved_date: string | null; status: string } | null;
  if (!row) return { ok: false, error: 'not found' };
  if (row.status !== 'pending') return { ok: false, error: t('settings.unauthorized') };

  const { error } = await supabase.from('erp_stock_requests').update({
    approved_date: input.date,
    date_changed_by: ctx.userId,
    date_changed_at: new Date().toISOString(),
    date_change_note: input.note?.trim() || null,
  }).eq('id', input.id);
  if (error) return { ok: false, error: friendlyDbError(error) };

  await logAudit(supabase, {
    action: 'stock_request.date_change', entity: 'stock_request', entityId: input.id, companyId: ctx.companyId ?? undefined,
    details: { from: row.requested_date, to: input.date, note: input.note?.trim() || null },
  });
  revalidatePath('/inventory/requests');
  return { ok: true };
}

/** Warehouse keeper / manager approves: moves stock to the van (atomic RPC). */
export async function approveStockRequest(id: string): Promise<ActionResult> {
  const { ctx, error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };
  const { t } = await getT();
  // MJ-1: approving moves stock to the van — require stock_request.approve
  // (separated from stock_request.create that the requesting rep holds).
  if (!hasPermission(ctx!, 'stock_request.approve')) return { ok: false, error: t('settings.unauthorized') };
  const supabase = await createClient();
  const { error } = await supabase.rpc('erp_approve_stock_request', { p_request_id: id });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/inventory/requests');
  revalidatePath('/inventory');
  return { ok: true };
}

export async function rejectStockRequest(id: string): Promise<ActionResult> {
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };
  const supabase = await createClient();
  const { error } = await supabase
    .from('erp_stock_requests')
    .update({ status: 'rejected' })
    .eq('id', id)
    .eq('status', 'pending');
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/inventory/requests');
  return { ok: true };
}

export async function cancelStockRequest(id: string): Promise<ActionResult> {
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };
  const supabase = await createClient();
  const { error } = await supabase
    .from('erp_stock_requests')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('status', 'pending');
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/inventory/requests');
  return { ok: true };
}
