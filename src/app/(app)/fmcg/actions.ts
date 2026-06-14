'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, type ActionResult } from '@/lib/erp/guards';
import { hasPermission } from '@/lib/erp/permissions';
import { APPROVAL_VANRECON } from '@/lib/erp/approval-flags';

/** ── FMCG Value Acceleration Wave 1 — server actions ─────────────────────────
 *  Thin, permission-gated wrappers over the validated 0137–0143 RPCs, plus
 *  tenant-safe CRUD for the new master tables (UOMs, prices, targets, return
 *  reasons). Each gate mirrors the action's granular permission as
 *  defense-in-depth (the RPCs / RLS also self-guard). Every read/write is RLS-
 *  scoped to the caller's company; inserts are company-stamped by the
 *  erp_set_company_id() BEFORE-INSERT trigger. All return ActionResult. */

// ── Product search (combobox) ─────────────────────────────────────────────────

export interface ProductSearchRow {
  id: string;
  code: string;
  name: string;
  name_ar: string | null;
  barcode: string | null;
  brand: string | null;
  sell_price: number;
  default_sell_uom: string | null;
}

/** Paged, tenant-scoped product typeahead (wraps erp_search_products). */
export async function searchProducts(
  q: string,
  limit = 20,
  offset = 0,
): Promise<ActionResult<ProductSearchRow[]>> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error };
  if (!hasPermission(ctx, 'product.search')) return { ok: false, error: 'unauthorized' };

  const supabase = await createClient();
  const { data, error: rpcErr } = await supabase.rpc('erp_search_products', {
    p_q: q ?? '',
    p_limit: Math.min(Math.max(limit, 1), 100),
    p_offset: Math.max(offset, 0),
  });
  if (rpcErr) return { ok: false, error: rpcErr.message };
  return { ok: true, data: (data as ProductSearchRow[]) ?? [] };
}

// ── Customer search (combobox) ─────────────────────────────────────────────────
// There is no customer-search RPC, so this queries erp_customers directly with
// ILIKE over name/name_ar/code/phone, RLS-scoped to the caller's company. Gated
// by customers.manage (the perm that already governs customer visibility).

export interface CustomerSearchRow {
  id: string;
  code: string;
  name: string;
  name_ar: string | null;
  phone: string | null;
}

export async function searchCustomers(
  q: string,
  limit = 20,
  offset = 0,
): Promise<ActionResult<CustomerSearchRow[]>> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error };
  if (!hasPermission(ctx, 'customers.manage')) return { ok: false, error: 'unauthorized' };

  const lim = Math.min(Math.max(limit, 1), 100);
  const off = Math.max(offset, 0);
  const supabase = await createClient();
  let query = supabase
    .from('erp_customers')
    .select('id, code, name, name_ar, phone')
    .eq('is_active', true)
    .order('name')
    .range(off, off + lim - 1);

  const term = (q ?? '').trim();
  if (term) {
    const like = `%${term}%`;
    query = query.or(
      `name.ilike.${like},name_ar.ilike.${like},code.ilike.${like},phone.ilike.${like}`,
    );
  }
  const { data, error: dbErr } = await query;
  if (dbErr) return { ok: false, error: dbErr.message };
  return { ok: true, data: (data as CustomerSearchRow[]) ?? [] };
}

// ── Pricing ─────────────────────────────────────────────────────────────────

/** Resolve the unit price for a uom/qty (wraps erp_resolve_price). */
export async function resolvePriceAction(input: {
  productId: string;
  uom: string;
  qty: number;
  customerId?: string | null;
  channelId?: string | null;
  date?: string | null;
}): Promise<ActionResult<number>> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error };
  if (!hasPermission(ctx, 'pricing.view')) return { ok: false, error: 'unauthorized' };

  const supabase = await createClient();
  const { data, error: rpcErr } = await supabase.rpc('erp_resolve_price', {
    p_product_id: input.productId,
    p_uom: input.uom,
    p_qty: input.qty,
    p_customer_id: input.customerId ?? null,
    p_channel_id: input.channelId ?? null,
    p_date: input.date ?? null,
  });
  if (rpcErr) return { ok: false, error: rpcErr.message };
  return { ok: true, data: Number(data) };
}

/** Convert a qty in a uom to base units (wraps erp_uom_to_base). */
export async function uomToBaseAction(input: {
  productId: string;
  uom: string;
  qty: number;
}): Promise<ActionResult<number>> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error };
  if (!hasPermission(ctx, 'pricing.view')) return { ok: false, error: 'unauthorized' };

  const supabase = await createClient();
  const { data, error: rpcErr } = await supabase.rpc('erp_uom_to_base', {
    p_product_id: input.productId,
    p_uom: input.uom,
    p_qty: input.qty,
  });
  if (rpcErr) return { ok: false, error: rpcErr.message };
  return { ok: true, data: Number(data) };
}

export interface PriceInput {
  id?: string;
  product_id: string;
  uom: string;
  channel_id?: string | null;
  customer_id?: string | null;
  min_qty: number;
  price: number;
  currency?: string | null;
  effective_from: string;
  effective_to?: string | null;
  is_active?: boolean;
}

/** Create / update a price-book row (pricing.manage). */
export async function upsertPrice(input: PriceInput): Promise<ActionResult> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error };
  if (!hasPermission(ctx, 'pricing.manage')) return { ok: false, error: 'unauthorized' };
  if (!input.product_id || !input.uom) return { ok: false, error: 'invalid_input' };

  const supabase = await createClient();
  const row = {
    product_id: input.product_id,
    uom: input.uom,
    channel_id: input.channel_id || null,
    customer_id: input.customer_id || null,
    min_qty: Number.isFinite(input.min_qty) && input.min_qty > 0 ? input.min_qty : 1,
    price: Number.isFinite(input.price) && input.price >= 0 ? input.price : 0,
    currency: input.currency || null,
    effective_from: input.effective_from,
    effective_to: input.effective_to || null,
    is_active: input.is_active ?? true,
    updated_by: ctx.userId,
  };
  if (input.id) {
    const { error: dbErr } = await supabase.from('erp_prices').update(row).eq('id', input.id);
    if (dbErr) return { ok: false, error: dbErr.message };
  } else {
    const { error: dbErr } = await supabase
      .from('erp_prices')
      .insert({ ...row, created_by: ctx.userId });
    if (dbErr) return { ok: false, error: dbErr.message };
  }
  revalidatePath('/sales/pricing');
  return { ok: true };
}

export async function deletePrice(id: string): Promise<ActionResult> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error };
  if (!hasPermission(ctx, 'pricing.manage')) return { ok: false, error: 'unauthorized' };

  const supabase = await createClient();
  const { error: dbErr } = await supabase.from('erp_prices').delete().eq('id', id);
  if (dbErr) return { ok: false, error: dbErr.message };
  revalidatePath('/sales/pricing');
  return { ok: true };
}

// ── Product UOMs ──────────────────────────────────────────────────────────────

export interface ProductUomInput {
  id?: string;
  product_id: string;
  uom: string;
  factor: number;
  barcode?: string | null;
  is_case?: boolean;
  sort?: number;
}

/** Create / update a product UOM conversion (uom.manage). */
export async function upsertProductUom(input: ProductUomInput): Promise<ActionResult> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error };
  if (!hasPermission(ctx, 'uom.manage')) return { ok: false, error: 'unauthorized' };
  if (!input.product_id || !input.uom) return { ok: false, error: 'invalid_input' };

  const supabase = await createClient();
  const row = {
    product_id: input.product_id,
    uom: input.uom,
    factor: Number.isFinite(input.factor) && input.factor > 0 ? input.factor : 1,
    barcode: input.barcode || null,
    is_case: input.is_case ?? false,
    sort: input.sort ?? 0,
  };
  if (input.id) {
    const { error: dbErr } = await supabase.from('erp_product_uoms').update(row).eq('id', input.id);
    if (dbErr) return { ok: false, error: dbErr.message };
  } else {
    const { error: dbErr } = await supabase.from('erp_product_uoms').insert(row);
    if (dbErr) return { ok: false, error: dbErr.message };
  }
  revalidatePath('/settings/uom');
  return { ok: true };
}

export async function deleteProductUom(id: string): Promise<ActionResult> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error };
  if (!hasPermission(ctx, 'uom.manage')) return { ok: false, error: 'unauthorized' };

  const supabase = await createClient();
  const { error: dbErr } = await supabase.from('erp_product_uoms').delete().eq('id', id);
  if (dbErr) return { ok: false, error: dbErr.message };
  revalidatePath('/settings/uom');
  return { ok: true };
}

/** List a product's UOM rows (uom.manage / pricing.view). */
export async function listProductUoms(productId: string): Promise<ActionResult<ProductUomInput[]>> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error };
  if (!hasPermission(ctx, 'uom.manage') && !hasPermission(ctx, 'pricing.view')) {
    return { ok: false, error: 'unauthorized' };
  }
  const supabase = await createClient();
  const { data, error: dbErr } = await supabase
    .from('erp_product_uoms')
    .select('id, product_id, uom, factor, barcode, is_case, sort')
    .eq('product_id', productId)
    .order('sort')
    .order('factor');
  if (dbErr) return { ok: false, error: dbErr.message };
  return { ok: true, data: (data as ProductUomInput[]) ?? [] };
}

// ── Targets ───────────────────────────────────────────────────────────────────

export interface TargetInput {
  id?: string;
  level: string;
  scope_id?: string | null;
  period: string;
  period_start: string;
  period_end: string;
  metric: string;
  target_value: number;
}

/** Create / update a target row (target.manage). */
export async function upsertTarget(input: TargetInput): Promise<ActionResult> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error };
  if (!hasPermission(ctx, 'target.manage')) return { ok: false, error: 'unauthorized' };
  if (!input.level || !input.period || !input.metric || !input.period_start || !input.period_end) {
    return { ok: false, error: 'invalid_input' };
  }

  const supabase = await createClient();
  const row = {
    level: input.level,
    scope_id: input.scope_id || null,
    period: input.period,
    period_start: input.period_start,
    period_end: input.period_end,
    metric: input.metric,
    target_value: Number.isFinite(input.target_value) ? input.target_value : 0,
    updated_by: ctx.userId,
  };
  if (input.id) {
    const { error: dbErr } = await supabase.from('erp_targets').update(row).eq('id', input.id);
    if (dbErr) return { ok: false, error: dbErr.message };
  } else {
    const { error: dbErr } = await supabase
      .from('erp_targets')
      .insert({ ...row, created_by: ctx.userId });
    if (dbErr) return { ok: false, error: dbErr.message };
  }
  revalidatePath('/distribution/targets-achievement');
  return { ok: true };
}

export async function deleteTarget(id: string): Promise<ActionResult> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error };
  if (!hasPermission(ctx, 'target.manage')) return { ok: false, error: 'unauthorized' };

  const supabase = await createClient();
  const { error: dbErr } = await supabase.from('erp_targets').delete().eq('id', id);
  if (dbErr) return { ok: false, error: dbErr.message };
  revalidatePath('/distribution/targets-achievement');
  return { ok: true };
}

export interface TargetAchievement {
  target: number;
  actual: number | null;
  achievement_pct: number | null;
  gap: number | null;
  remaining_days: number;
  required_daily_run_rate: number | null;
  forecast: number | null;
  note: string | null;
}

/** Compute achievement for a target (wraps erp_target_achievement). */
export async function targetAchievement(targetId: string): Promise<ActionResult<TargetAchievement>> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error };
  if (!hasPermission(ctx, 'target.view')) return { ok: false, error: 'unauthorized' };

  const supabase = await createClient();
  const { data, error: rpcErr } = await supabase.rpc('erp_target_achievement', {
    p_target_id: targetId,
  });
  if (rpcErr) return { ok: false, error: rpcErr.message };
  return { ok: true, data: data as TargetAchievement };
}

// ── Return reasons + analytics ─────────────────────────────────────────────────

export interface ReturnReasonInput {
  id?: string;
  code: string;
  label_en?: string | null;
  label_ar?: string | null;
  is_active?: boolean;
  sort?: number;
}

/** Create / update a return-reason catalog row (return.reason.manage). */
export async function upsertReturnReason(input: ReturnReasonInput): Promise<ActionResult> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error };
  if (!hasPermission(ctx, 'return.reason.manage')) return { ok: false, error: 'unauthorized' };
  if (!input.code) return { ok: false, error: 'invalid_input' };

  const supabase = await createClient();
  const row = {
    code: input.code.trim(),
    label_en: input.label_en || null,
    label_ar: input.label_ar || null,
    is_active: input.is_active ?? true,
    sort: input.sort ?? 0,
  };
  if (input.id) {
    const { error: dbErr } = await supabase.from('erp_return_reasons').update(row).eq('id', input.id);
    if (dbErr) return { ok: false, error: dbErr.message };
  } else {
    const { error: dbErr } = await supabase.from('erp_return_reasons').insert(row);
    if (dbErr) return { ok: false, error: dbErr.message };
  }
  revalidatePath('/distribution/returns-analysis');
  return { ok: true };
}

export async function deleteReturnReason(id: string): Promise<ActionResult> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error };
  if (!hasPermission(ctx, 'return.reason.manage')) return { ok: false, error: 'unauthorized' };

  const supabase = await createClient();
  const { error: dbErr } = await supabase.from('erp_return_reasons').delete().eq('id', id);
  if (dbErr) return { ok: false, error: dbErr.message };
  revalidatePath('/distribution/returns-analysis');
  return { ok: true };
}

export interface ReturnsByReasonRow {
  reason_id: string | null;
  reason_label_en: string | null;
  reason_label_ar: string | null;
  return_count: number;
  total_value: number;
}

/** Returns grouped by reason over a window (wraps erp_returns_by_reason). */
export async function returnsByReason(
  from: string,
  to: string,
): Promise<ActionResult<ReturnsByReasonRow[]>> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error };
  // The RPC guards on reports.view; mirror it (report.aggregate.view holders too).
  if (!hasPermission(ctx, 'reports.view') && !hasPermission(ctx, 'report.aggregate.view')) {
    return { ok: false, error: 'unauthorized' };
  }
  const supabase = await createClient();
  const { data, error: rpcErr } = await supabase.rpc('erp_returns_by_reason', {
    p_from: from,
    p_to: to,
  });
  if (rpcErr) return { ok: false, error: rpcErr.message };
  return { ok: true, data: (data as ReturnsByReasonRow[]) ?? [] };
}

// ── Van reconciliation ──────────────────────────────────────────────────────

export interface ReconActual {
  product_id: string;
  actual_qty: number;
}

/** Compute (upsert) a van reconciliation from physical counts. */
export async function computeVanReconciliation(
  workSessionId: string,
  actuals: ReconActual[],
): Promise<ActionResult> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error };
  if (!hasPermission(ctx, 'reconciliation.manage')) return { ok: false, error: 'unauthorized' };

  const supabase = await createClient();
  const { data, error: rpcErr } = await supabase.rpc('erp_compute_van_reconciliation', {
    p_work_session_id: workSessionId,
    p_actuals: actuals,
  });
  if (rpcErr) return { ok: false, error: rpcErr.message };

  // P2 (flag KAKO_APPROVAL_VANRECON): when variance puts the reconciliation in
  // pending_approval, route it through the engine. Flag OFF ⇒ skipped (legacy
  // settle/reject path + the under-threshold auto-draft are unchanged).
  const rd = data as { reconciliation_id?: string; status?: string } | null;
  if (APPROVAL_VANRECON() && rd?.reconciliation_id && rd?.status === 'pending_approval') {
    await supabase.rpc('erp_workflow_start', {
      p_key: 'van_reconciliation_approval', p_entity: 'van_reconciliation', p_record_id: rd.reconciliation_id, p_context: {},
    });
  }
  revalidatePath('/field/van-reconciliation');
  return { ok: true, data };
}

export async function settleVanReconciliation(id: string): Promise<ActionResult> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error };
  if (!hasPermission(ctx, 'reconciliation.approve')) return { ok: false, error: 'unauthorized' };

  const supabase = await createClient();
  const { data, error: rpcErr } = await supabase.rpc('erp_settle_van_reconciliation', { p_id: id });
  if (rpcErr) return { ok: false, error: rpcErr.message };
  revalidatePath('/field/van-reconciliation');
  return { ok: true, data };
}

export async function rejectVanReconciliation(id: string, reason: string): Promise<ActionResult> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error };
  if (!hasPermission(ctx, 'reconciliation.approve')) return { ok: false, error: 'unauthorized' };

  const supabase = await createClient();
  const { data, error: rpcErr } = await supabase.rpc('erp_reject_van_reconciliation', {
    p_id: id,
    p_reason: reason,
  });
  if (rpcErr) return { ok: false, error: rpcErr.message };
  revalidatePath('/field/van-reconciliation');
  return { ok: true, data };
}

// ── Credit-limit requests ─────────────────────────────────────────────────────

export async function requestCreditLimit(input: {
  customerId: string;
  requestedLimit: number;
  reason?: string | null;
}): Promise<ActionResult> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error };
  if (!hasPermission(ctx, 'credit.request.create')) return { ok: false, error: 'unauthorized' };

  const supabase = await createClient();
  const { data, error: rpcErr } = await supabase.rpc('erp_request_credit_limit', {
    p_customer_id: input.customerId,
    p_requested_limit: input.requestedLimit,
    p_reason: input.reason ?? null,
  });
  if (rpcErr) return { ok: false, error: rpcErr.message };
  revalidatePath('/distribution/credit-requests');
  return { ok: true, data };
}

export async function decideCreditLimit(input: {
  id: string;
  approve: boolean;
  approvedAmount?: number | null;
  expiry?: string | null;
  note?: string | null;
}): Promise<ActionResult> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error };
  if (!hasPermission(ctx, 'credit.request.approve')) return { ok: false, error: 'unauthorized' };

  const supabase = await createClient();
  const { data, error: rpcErr } = await supabase.rpc('erp_decide_credit_limit', {
    p_id: input.id,
    p_approve: input.approve,
    p_approved_amount: input.approvedAmount ?? null,
    p_expiry: input.expiry ?? null,
    p_note: input.note ?? null,
  });
  if (rpcErr) return { ok: false, error: rpcErr.message };
  revalidatePath('/distribution/credit-requests');
  return { ok: true, data };
}

// ── Aggregate reports ─────────────────────────────────────────────────────────

export interface SalesSummaryRow {
  branch_id: string;
  net_sales: number;
  paid: number;
  outstanding: number;
  invoice_count: number;
}

export async function salesSummary(
  from: string,
  to: string,
  branchId?: string | null,
): Promise<ActionResult<SalesSummaryRow[]>> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error };
  if (!hasPermission(ctx, 'report.aggregate.view')) return { ok: false, error: 'unauthorized' };

  const supabase = await createClient();
  const { data, error: rpcErr } = await supabase.rpc('erp_sales_summary', {
    p_from: from,
    p_to: to,
    p_branch_id: branchId ?? null,
  });
  if (rpcErr) return { ok: false, error: rpcErr.message };
  return { ok: true, data: (data as SalesSummaryRow[]) ?? [] };
}

export interface CoverageSummaryRow {
  avg_coverage: number | null;
  sessions: number;
  gps_violations: number;
  out_of_route: number;
}

export async function coverageSummary(
  from: string,
  to: string,
): Promise<ActionResult<CoverageSummaryRow[]>> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error };
  if (!hasPermission(ctx, 'report.aggregate.view')) return { ok: false, error: 'unauthorized' };

  const supabase = await createClient();
  const { data, error: rpcErr } = await supabase.rpc('erp_coverage_summary', {
    p_from: from,
    p_to: to,
  });
  if (rpcErr) return { ok: false, error: rpcErr.message };
  return { ok: true, data: (data as CoverageSummaryRow[]) ?? [] };
}
