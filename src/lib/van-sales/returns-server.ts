'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { emitDomainEvent, EVENT } from '@/lib/events/producer';
import { requireAuth, requireActionPermission, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { isVanSalesActive } from './settings-server';
import { isVanDayOpen } from './day-server';
import { normalizeReturnLines, computeReturnTotal, type ReturnLineInput, type PricedReturnLine } from './returns';
import { getFeatureFlags } from '@/lib/erp/feature-flags';
import type { BranchRole } from '@/lib/erp/types';
import {
  resolveReturnDecision, canApproveReturn, returnApprovalEnabled, DEFAULT_RETURN_POLICY,
  type ReturnApprovalPolicy, type ReturnContext, type ReturnRule, type ReturnTypeKind, type ApprovalLevel,
} from './return-policy';
import { returnSlaEnabled } from './return-sla';

// ============================================================================
// Van Return — thin server wrapper (Phase 3, optional thin UI). Validates the
// request then delegates the WHOLE return to erp_van_return, the sole authority
// (return-to-van, mandatory reason, server-side pricing, optional credit note,
// audit, idempotency — all atomic). The wrapper adds the enablement gate, a
// read-only price preview, the domain event, and revalidation. It never prices.
// ============================================================================

export interface VanReturnInput {
  branch_id: string;
  customer_id: string;
  reason_id: string;
  lines: ReturnLineInput[];
  invoice_id?: string;
  create_credit_note?: boolean;
  notes?: string;
  idempotency_key?: string;
}

export interface VanReturnPreview { lines: PricedReturnLine[]; total: number }

const RPC_ERRORS: Record<string, string> = {
  not_authenticated: 'Not authenticated.',
  branch_access_denied: 'You do not have access to this branch.',
  branch_not_found: 'Branch not found.',
  customer_not_found: 'Customer not found.',
  reason_required: 'A return reason is required.',
  invalid_reason: 'That return reason is not valid for this company.',
  no_van_assigned: 'No van is assigned to you — a van return must go to your van.',
  invoice_mismatch: 'The selected invoice does not belong to this customer.',
  no_valid_lines: 'Add at least one line with a quantity.',
};

/** Resolve the credited price of each line server-side (original invoice line if
 *  given, else current resolved price) for the review step. Creates nothing. */
export async function previewVanReturn(input: { branch_id: string; customer_id: string; invoice_id?: string; lines: ReturnLineInput[] }): Promise<ActionResult<VanReturnPreview>> {
  const { ctx, error: authErr } = await requireAuth();
  if (authErr || !ctx) return { ok: false, error: authErr ?? 'Not authenticated.' };

  const supabase = await createClient();
  if (!(await isVanSalesActive(supabase, ctx))) return { ok: false, error: 'Van Sales is not enabled.' };
  if (!input.branch_id || !input.customer_id) return { ok: false, error: 'Branch and customer are required.' };

  const lines = normalizeReturnLines(input.lines ?? []);
  if (lines.length === 0) return { ok: false, error: RPC_ERRORS.no_valid_lines };

  // Original invoice prices, if an invoice is referenced.
  const invoicePrice = new Map<string, number>();
  if (input.invoice_id) {
    const { data } = await supabase
      .from('erp_invoice_lines')
      .select('product_id, unit_price')
      .eq('invoice_id', input.invoice_id);
    for (const r of (data ?? []) as { product_id: string; unit_price: number }[]) invoicePrice.set(r.product_id, Number(r.unit_price));
  }

  const priced: PricedReturnLine[] = [];
  for (const l of lines) {
    let unit = invoicePrice.get(l.product_id);
    if (unit == null) {
      const { data: pr, error } = await supabase.rpc('erp_resolve_price', {
        p_product_id: l.product_id, p_customer_id: input.customer_id, p_branch_id: input.branch_id, p_qty: l.quantity,
      });
      if (error) return { ok: false, error: friendlyDbError(error) };
      const row = (Array.isArray(pr) ? pr[0] : pr) as { price: number } | undefined;
      unit = Number(row?.price ?? 0);
    }
    priced.push({ product_id: l.product_id, quantity: l.quantity, unit_price: unit });
  }

  return { ok: true, data: { lines: priced, total: computeReturnTotal(priced) } };
}

/** Accept a return back to the rep's van in one atomic RPC. Returns the return id
 *  + optional credit-note id. Gated by Van Sales being active for the company. */
export async function vanReturn(input: VanReturnInput): Promise<ActionResult<{ id: string; returnNumber: string; creditNoteId: string | null; totalAmount: number }>> {
  // Always-on money-path authorization (not flag-gated): committing a van return
  // requires the field-sales permission — mirrors the erp_van_return RPC guard.
  const { ctx, error: authErr } = await requireActionPermission('field.sales');
  if (authErr || !ctx) return { ok: false, error: authErr ?? 'Not authenticated.' };

  const supabase = await createClient();
  if (!(await isVanSalesActive(supabase, ctx))) return { ok: false, error: 'Van Sales is not enabled.' };
  if (!(await isVanDayOpen(ctx.userId))) return { ok: false, error: 'Your day is closed — start a new day before creating transactions.' };
  if (!input.branch_id) return { ok: false, error: 'Branch is required.' };
  if (!input.customer_id) return { ok: false, error: 'Customer is required.' };
  if (!input.reason_id) return { ok: false, error: RPC_ERRORS.reason_required };

  const lines = normalizeReturnLines(input.lines ?? []);
  if (lines.length === 0) return { ok: false, error: RPC_ERRORS.no_valid_lines };

  // Invoice-anchored return: never let a line exceed what's still returnable
  // (sold − previously returned) on the selected invoice. Server-authoritative;
  // the UI caps too, but this is the guard. A product not on the invoice ⇒ 0.
  if (input.invoice_id) {
    const remaining = await invoiceRemainingMap(supabase, input.invoice_id);
    for (const l of lines) {
      const rem = remaining.get(l.product_id)?.remaining ?? 0;
      if (l.quantity > rem + 1e-6) return { ok: false, error: RETURN_EXCEEDS };
    }
  }

  const { data, error } = await supabase.rpc('erp_van_return', {
    p_branch_id: input.branch_id,
    p_customer_id: input.customer_id,
    p_lines: lines,
    p_reason_id: input.reason_id,
    p_invoice_id: input.invoice_id ?? null,
    p_create_credit_note: input.create_credit_note ?? false,
    p_notes: input.notes ?? null,
    p_idempotency_key: input.idempotency_key ?? null,
  });
  if (error) return { ok: false, error: RPC_ERRORS[error.message] ?? friendlyDbError(error) };

  const row = (Array.isArray(data) ? data[0] : data) as
    | { return_id: string; return_number: string; credit_note_id: string | null; total_amount: number }
    | undefined;
  if (!row?.return_id) return { ok: false, error: 'Van return failed.' };

  await emitDomainEvent({ eventType: EVENT.RETURN_APPROVED, entity: 'return', recordId: row.return_id });
  revalidatePath('/sales/returns');
  revalidatePath('/customers');

  return { ok: true, data: { id: row.return_id, returnNumber: row.return_number, creditNoteId: row.credit_note_id, totalAmount: Number(row.total_amount) } };
}

// ============================================================================
// Invoice-anchored return: pick an invoice → its items with Sold / Previously
// returned / Remaining returnable. Read-only loaders for the screen; the cap is
// enforced both here (vanReturn guard) and in the UI. No transaction change.
// ============================================================================

const RETURN_EXCEEDS = 'You cannot return more than the remaining returnable quantity.';

export interface ReturnableInvoice { id: string; invoiceNumber: string; date: string; net: number }
export interface ReturnLineRow {
  productId: string; name: string; name_ar: string | null; code: string;
  sold: number; returned: number; remaining: number; unitPrice: number;
}

/** Per-product Sold / previously-returned / remaining for one invoice. */
async function invoiceRemainingMap(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any, invoiceId: string,
): Promise<Map<string, { sold: number; returned: number; remaining: number; unitPrice: number }>> {
  const map = new Map<string, { sold: number; returned: number; remaining: number; unitPrice: number }>();
  const { data: ilines } = await supabase.from('erp_invoice_lines').select('product_id, quantity, unit_price').eq('invoice_id', invoiceId);
  for (const r of (ilines ?? []) as { product_id: string; quantity: number; unit_price: number }[]) {
    const e = map.get(r.product_id) ?? { sold: 0, returned: 0, remaining: 0, unitPrice: Number(r.unit_price ?? 0) };
    e.sold += Number(r.quantity ?? 0);
    e.unitPrice = Number(r.unit_price ?? 0);
    map.set(r.product_id, e);
  }
  const { data: rets } = await supabase.from('erp_sales_returns').select('id').eq('invoice_id', invoiceId).eq('status', 'completed');
  const retIds = ((rets ?? []) as { id: string }[]).map((r) => r.id);
  if (retIds.length > 0) {
    const { data: rl } = await supabase.from('erp_sales_return_lines').select('product_id, quantity').in('return_id', retIds);
    for (const r of (rl ?? []) as { product_id: string; quantity: number }[]) {
      const e = map.get(r.product_id);
      if (e) e.returned += Number(r.quantity ?? 0);
    }
  }
  for (const e of map.values()) e.remaining = Math.max(0, e.sold - e.returned);
  return map;
}

/** The customer's invoices eligible for return (non-draft, non-cancelled), newest first. */
export async function loadReturnableInvoices(branchId: string, customerId: string): Promise<ActionResult<ReturnableInvoice[]>> {
  const { ctx, error: authErr } = await requireAuth();
  if (authErr || !ctx) return { ok: false, error: authErr ?? 'Not authenticated.' };
  const supabase = await createClient();
  if (!(await isVanSalesActive(supabase, ctx))) return { ok: false, error: 'Van Sales is not enabled.' };
  if (!branchId || !customerId) return { ok: false, error: 'Branch and customer are required.' };

  const { data, error } = await supabase
    .from('erp_invoices')
    .select('id, invoice_number, created_at, net_amount, status')
    .eq('branch_id', branchId).eq('customer_id', customerId)
    .in('status', ['issued', 'paid', 'partially_paid', 'overdue'])
    .order('created_at', { ascending: false }).limit(100);
  if (error) return { ok: false, error: friendlyDbError(error) };

  const rows = ((data ?? []) as { id: string; invoice_number: string; created_at: string; net_amount: number }[])
    .map((r) => ({ id: r.id, invoiceNumber: r.invoice_number, date: String(r.created_at).slice(0, 10), net: Number(r.net_amount ?? 0) }));
  return { ok: true, data: rows };
}

/** The selected invoice's items with Sold / Previously returned / Remaining. */
export async function loadInvoiceReturnLines(invoiceId: string): Promise<ActionResult<ReturnLineRow[]>> {
  const { ctx, error: authErr } = await requireAuth();
  if (authErr || !ctx) return { ok: false, error: authErr ?? 'Not authenticated.' };
  const supabase = await createClient();
  if (!(await isVanSalesActive(supabase, ctx))) return { ok: false, error: 'Van Sales is not enabled.' };
  if (!invoiceId) return { ok: false, error: 'Invoice is required.' };

  const map = await invoiceRemainingMap(supabase, invoiceId);
  const ids = [...map.keys()];
  if (ids.length === 0) return { ok: true, data: [] };

  const { data: prods } = await supabase.from('erp_products_catalog').select('id, name, name_ar, code').in('id', ids);
  const pById = new Map(((prods ?? []) as { id: string; name: string; name_ar: string | null; code: string }[]).map((p) => [p.id, p]));

  const rows: ReturnLineRow[] = ids.map((id) => {
    const e = map.get(id)!;
    const p = pById.get(id);
    return { productId: id, name: p?.name ?? id, name_ar: p?.name_ar ?? null, code: p?.code ?? '', sold: e.sold, returned: e.returned, remaining: e.remaining, unitPrice: e.unitPrice };
  });
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return { ok: true, data: rows };
}

// ============================================================================
// Return Approval Workflow (flag: platform.return_approval). POLICY-DRIVEN and
// configurable — the company sets a MODE (disabled / open / approval) + ordered
// RULES (return type, value band, customer, class, salesman, route, category →
// auto / approval / block). Delegation: each rule/policy names a PRIMARY and a
// BACKUP approver level so a higher (or named backup) approver can step in when
// the primary is unavailable, without editing the policy.
//
// submitVanReturn  routes a field return through the policy:
//   • flag OFF or decision 'auto' → erp_van_return (post now, status completed)
//   • decision 'approval'         → erp_request_van_return (hold, pending_approval)
//   • decision 'block'            → refused (returns disabled for this case)
// decideVanReturn  approves (posts once) or rejects (reason) a held return, with
//   a delegation-aware level check on top of the always-on returns.approve/reject
//   permission gate and the RPC's no-self-approval guard.
// ============================================================================

/** Map a branch role to its return-approval level (delegation hierarchy). */
function roleToApproverLevel(role: BranchRole | null | undefined): ApprovalLevel | null {
  switch (role) {
    case 'supervisor':
      return 'supervisor';
    case 'branch_manager':
    case 'regional_manager':
    case 'area_manager':
    case 'manager':
      return 'branch_manager';
    case 'admin':
    case 'sales_director':
    case 'national_sales_manager':
    case 'it_admin':
      return 'company_admin';
    default:
      return null;
  }
}

interface PolicyRow {
  mode: string;
  approver_role: string | null;
  backup_approver_role: string | null;
}
interface RuleRow {
  priority: number; active: boolean;
  return_type: string | null; min_value: number | null; max_value: number | null;
  customer_id: string | null; customer_class: string | null; salesman_id: string | null;
  route_id: string | null; product_category_id: string | null;
  result: string; approver_level: string | null; backup_approver_level: string | null;
}

/** Load the company's configured return-approval policy + rules (else the default). */
async function loadReturnApprovalPolicy(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any, companyId: string,
): Promise<ReturnApprovalPolicy> {
  const { data: pol } = await supabase
    .from('erp_return_approval_policies')
    .select('mode, approver_role, backup_approver_role')
    .eq('company_id', companyId).maybeSingle();
  const { data: ruleRows } = await supabase
    .from('erp_return_approval_rules')
    .select('priority, active, return_type, min_value, max_value, customer_id, customer_class, salesman_id, route_id, product_category_id, result, approver_level, backup_approver_level')
    .eq('company_id', companyId);

  const p = pol as PolicyRow | null;
  const rules: ReturnRule[] = ((ruleRows ?? []) as RuleRow[]).map((r) => ({
    priority: Number(r.priority ?? 100),
    active: r.active,
    returnType: (r.return_type as ReturnTypeKind | null) ?? null,
    minValue: r.min_value, maxValue: r.max_value,
    customerId: r.customer_id, customerClass: r.customer_class,
    salesmanId: r.salesman_id, routeId: r.route_id,
    productCategoryId: r.product_category_id,
    result: (r.result as ReturnRule['result']) ?? 'approval',
    approverLevel: (r.approver_level as ApprovalLevel | null) ?? null,
    backupApproverLevel: (r.backup_approver_level as ApprovalLevel | null) ?? null,
  }));
  if (!p) return { ...DEFAULT_RETURN_POLICY, rules };
  return {
    mode: (p.mode as ReturnApprovalPolicy['mode']) ?? 'open',
    approverRole: (p.approver_role as ApprovalLevel | null) ?? 'supervisor',
    backupApproverRole: (p.backup_approver_role as ApprovalLevel | null) ?? null,
    rules,
  };
}

/** Build the policy context for a return (customer class/route + line categories). */
async function buildReturnContext(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  args: { returnType: ReturnTypeKind; value: number; customerId: string; salesmanId: string | null; productIds: string[] },
): Promise<ReturnContext> {
  const { data: cust } = await supabase
    .from('erp_customers')
    .select('classification_id, route_id')
    .eq('id', args.customerId).maybeSingle();
  let categoryIds: string[] = [];
  if (args.productIds.length > 0) {
    const { data: prods } = await supabase
      .from('erp_products_catalog')
      .select('category_id')
      .in('id', args.productIds);
    categoryIds = [...new Set(((prods ?? []) as { category_id: string | null }[]).map((p) => p.category_id).filter((c): c is string => !!c))];
  }
  return {
    returnType: args.returnType,
    value: args.value,
    customerId: args.customerId,
    customerClass: (cust as { classification_id: string | null } | null)?.classification_id ?? null,
    salesmanId: args.salesmanId,
    routeId: (cust as { route_id: string | null } | null)?.route_id ?? null,
    productCategoryIds: categoryIds,
  };
}

export interface SubmitReturnInput extends VanReturnInput {
  return_type?: ReturnTypeKind;
}

export type SubmitReturnResult =
  | { id: string; returnNumber: string; status: 'completed'; creditNoteId: string | null; totalAmount: number }
  | { id: string; returnNumber: string; status: 'pending_approval'; creditNoteId: null; totalAmount: number };

/**
 * Policy-aware entry point for a field return. Resolves the configured policy and
 * either posts immediately (auto / flag off), holds for approval, or refuses
 * (blocked). Always-on `returns.create` gate; the underlying RPCs add their own
 * authority + the day/enablement checks mirror `vanReturn`.
 */
export async function submitVanReturn(input: SubmitReturnInput): Promise<ActionResult<SubmitReturnResult>> {
  const { ctx, error: authErr } = await requireActionPermission('returns.create');
  if (authErr || !ctx) return { ok: false, error: authErr ?? 'Not authenticated.' };

  const supabase = await createClient();
  if (!(await isVanSalesActive(supabase, ctx))) return { ok: false, error: 'Van Sales is not enabled.' };
  if (!(await isVanDayOpen(ctx.userId))) return { ok: false, error: 'Your day is closed — start a new day before creating transactions.' };
  if (!input.branch_id) return { ok: false, error: 'Branch is required.' };
  if (!input.customer_id) return { ok: false, error: 'Customer is required.' };
  if (!input.reason_id) return { ok: false, error: RPC_ERRORS.reason_required };

  const lines = normalizeReturnLines(input.lines ?? []);
  if (lines.length === 0) return { ok: false, error: RPC_ERRORS.no_valid_lines };

  const flags = await getFeatureFlags(supabase, ctx.companyId);
  const returnType: ReturnTypeKind = input.return_type === 'damage' ? 'damage' : 'saleable';

  // Direct post (flag OFF or auto) → existing erp_van_return path, status completed.
  const postDirect = async (): Promise<ActionResult<SubmitReturnResult>> => {
    const r = await vanReturn(input);
    if (!r.ok || !r.data) return { ok: false, error: r.error };
    return { ok: true, data: { ...r.data, status: 'completed' } };
  };

  // Flag OFF or no company → preserve the existing Direct (open) return behaviour.
  if (!returnApprovalEnabled(flags) || !ctx.companyId) {
    return postDirect();
  }

  // Price for the policy value band (server-authoritative, creates nothing).
  const preview = await previewVanReturn({ branch_id: input.branch_id, customer_id: input.customer_id, invoice_id: input.invoice_id, lines });
  if (!preview.ok || !preview.data) return { ok: false, error: preview.error ?? 'Could not price the return.' };
  const value = preview.data.total;

  const policy = await loadReturnApprovalPolicy(supabase, ctx.companyId);
  const rctx = await buildReturnContext(supabase, { returnType, value, customerId: input.customer_id, salesmanId: ctx.userId, productIds: lines.map((l) => l.product_id) });
  const resolution = resolveReturnDecision(rctx, policy);

  if (resolution.decision === 'block') {
    return { ok: false, error: 'Returns are disabled for this case by company policy.' };
  }

  if (resolution.decision === 'auto') {
    return postDirect();
  }

  // decision 'approval' → hold the return for an approver.
  if (input.invoice_id) {
    const remaining = await invoiceRemainingMap(supabase, input.invoice_id);
    for (const l of lines) {
      const rem = remaining.get(l.product_id)?.remaining ?? 0;
      if (l.quantity > rem + 1e-6) return { ok: false, error: RETURN_EXCEEDS };
    }
  }

  const { data, error } = await supabase.rpc('erp_request_van_return', {
    p_branch_id: input.branch_id,
    p_customer_id: input.customer_id,
    p_lines: lines,
    p_reason_id: input.reason_id,
    p_invoice_id: input.invoice_id ?? null,
    p_create_credit_note: input.create_credit_note ?? false,
    p_notes: input.notes ?? null,
    p_return_type: returnType,
    p_idempotency_key: input.idempotency_key ?? null,
  });
  if (error) return { ok: false, error: RPC_ERRORS[error.message] ?? friendlyDbError(error) };

  const row = (Array.isArray(data) ? data[0] : data) as { return_id: string; return_number: string; total_amount: number } | undefined;
  if (!row?.return_id) return { ok: false, error: 'Return request failed.' };

  revalidatePath('/sales/returns');
  return { ok: true, data: { id: row.return_id, returnNumber: row.return_number, status: 'pending_approval', creditNoteId: null, totalAmount: Number(row.total_amount) } };
}

const DECIDE_ERRORS: Record<string, string> = {
  ...RPC_ERRORS,
  return_not_found: 'Return not found.',
  not_pending: 'This return is not awaiting approval.',
  self_approval: 'You cannot approve your own return request.',
  invalid_decision: 'Invalid decision.',
};

/**
 * Approve (post once) or reject (reason) a held return. Gated by the always-on
 * `returns.approve` / `returns.reject` permission, then a DELEGATION-aware level
 * check (primary approver, anyone higher, or the named backup may approve). The
 * RPC enforces no-self-approval, branch access and the single atomic posting.
 */
export async function decideVanReturn(input: { return_id: string; decision: 'approve' | 'reject'; reason?: string; comment?: string }): Promise<ActionResult<{ id: string; status: string; creditNoteId: string | null }>> {
  const perm = input.decision === 'reject' ? 'returns.reject' : 'returns.approve';
  const { ctx, error: authErr } = await requireActionPermission(perm);
  if (authErr || !ctx) return { ok: false, error: authErr ?? 'Not authenticated.' };
  if (!input.return_id) return { ok: false, error: 'Return is required.' };
  if (input.decision === 'reject' && !input.reason?.trim()) return { ok: false, error: 'A rejection reason is required.' };

  const supabase = await createClient();
  if (!(await isVanSalesActive(supabase, ctx))) return { ok: false, error: 'Van Sales is not enabled.' };

  // Delegation-aware level check (skipped for super admin / platform owner, who
  // hold everything). Re-resolve the policy for THIS return's context so the
  // required approver level (primary + backup) matches what the requester saw.
  if (!ctx.isSuperAdmin && !ctx.isPlatformOwner) {
    const { data: ret } = await supabase
      .from('erp_sales_returns')
      .select('customer_id, total_amount, return_type, requested_by, created_by')
      .eq('id', input.return_id).maybeSingle();
    const r = ret as { customer_id: string; total_amount: number; return_type: string | null; requested_by: string | null; created_by: string | null } | null;
    if (r) {
      const { data: rl } = await supabase.from('erp_sales_return_lines').select('product_id').eq('return_id', input.return_id);
      const productIds = ((rl ?? []) as { product_id: string }[]).map((x) => x.product_id);
      const returnType: ReturnTypeKind = r.return_type === 'damage' ? 'damage' : 'saleable';
      const policy = await loadReturnApprovalPolicy(supabase, ctx.companyId!);
      const rctx = await buildReturnContext(supabase, { returnType, value: Number(r.total_amount ?? 0), customerId: r.customer_id, salesmanId: r.requested_by ?? r.created_by, productIds });
      const resolution = resolveReturnDecision(rctx, policy);
      const myLevel = roleToApproverLevel(ctx.topRole);
      if (!canApproveReturn(myLevel, resolution)) {
        return { ok: false, error: 'Your approval level is not authorized for this return.' };
      }
    }
  }

  const { data, error } = await supabase.rpc('erp_decide_van_return', {
    p_return_id: input.return_id,
    p_decision: input.decision,
    p_reason: input.reason ?? null,
    p_comment: input.comment ?? null,
  });
  if (error) return { ok: false, error: DECIDE_ERRORS[error.message] ?? friendlyDbError(error) };

  const row = (Array.isArray(data) ? data[0] : data) as { return_id: string; status: string; credit_note_id: string | null } | undefined;
  if (!row?.return_id) return { ok: false, error: 'Decision failed.' };

  if (row.status === 'completed') {
    await emitDomainEvent({ eventType: EVENT.RETURN_APPROVED, entity: 'return', recordId: row.return_id });
    revalidatePath('/customers');
  }
  revalidatePath('/sales/returns');
  return { ok: true, data: { id: row.return_id, status: row.status, creditNoteId: row.credit_note_id } };
}

/**
 * SLA: stamp the first time an approver opens a held return (idempotent, never by
 * the requester). Gated by the company opt-in `platform.return_approval_sla` flag
 * and the always-on `returns.approve` permission. Returns the first-viewed time
 * (existing or newly set). A no-op success when SLA tracking is off.
 */
export async function markReturnViewed(returnId: string): Promise<ActionResult<{ firstViewedAt: string | null }>> {
  const { ctx, error: authErr } = await requireActionPermission('returns.approve');
  if (authErr || !ctx) return { ok: false, error: authErr ?? 'Not authenticated.' };
  if (!returnId) return { ok: false, error: 'Return is required.' };

  const supabase = await createClient();
  const flags = await getFeatureFlags(supabase, ctx.companyId);
  if (!returnSlaEnabled(flags)) return { ok: true, data: { firstViewedAt: null } };

  const { data, error } = await supabase.rpc('erp_mark_return_viewed', { p_return_id: returnId });
  if (error) return { ok: false, error: DECIDE_ERRORS[error.message] ?? friendlyDbError(error) };
  return { ok: true, data: { firstViewedAt: (data as string | null) ?? null } };
}

// ── Approver pending queue ───────────────────────────────────────────────────

export interface PendingReturnRow {
  id: string;
  returnNumber: string;
  customerName: string;
  customerCode: string;
  requesterName: string;
  requestedBy: string | null;
  requestedAt: string | null;
  firstViewedAt: string | null;
  value: number;
  returnType: ReturnTypeKind;
  lineCount: number;
  notes: string | null;
  /** Human label for the matched policy rule (or the mode default). */
  policyLabel: string;
  approver: ApprovalLevel;
  backupApprover: ApprovalLevel | null;
}

/** Short, human description of a matched approval rule (no DB lookups). */
function describeRule(r: ReturnRule): string {
  const parts: string[] = [];
  if (r.returnType) parts.push(r.returnType);
  if (r.minValue != null && r.maxValue != null) parts.push(`${r.minValue}–${r.maxValue}`);
  else if (r.maxValue != null) parts.push(`≤ ${r.maxValue}`);
  else if (r.minValue != null) parts.push(`≥ ${r.minValue}`);
  if (r.customerId) parts.push('customer');
  if (r.customerClass) parts.push('class');
  if (r.salesmanId) parts.push('salesman');
  if (r.routeId) parts.push('route');
  if (r.productCategoryId) parts.push('category');
  return parts.length ? parts.join(' · ') : 'rule';
}

/**
 * The approver's pending-approval queue (held van returns) with the resolved
 * policy (matched rule + primary/backup approver) and SLA timestamps. Branch
 * scoped by RLS; gated by the always-on returns.approve permission. Read-only —
 * stamping first-viewed and deciding are separate actions.
 */
export async function loadPendingReturnApprovals(): Promise<ActionResult<PendingReturnRow[]>> {
  const { ctx, error: authErr } = await requireActionPermission('returns.approve');
  if (authErr || !ctx) return { ok: false, error: authErr ?? 'Not authenticated.' };

  const supabase = await createClient();
  if (!(await isVanSalesActive(supabase, ctx))) return { ok: false, error: 'Van Sales is not enabled.' };

  const { data: rows, error } = await supabase
    .from('erp_sales_returns')
    .select('id, return_number, customer_id, total_amount, return_type, requested_by, created_by, requested_at, created_at, first_viewed_at, notes')
    .eq('status', 'pending_approval')
    .order('requested_at', { ascending: true })
    .limit(200);
  if (error) return { ok: false, error: friendlyDbError(error) };

  const returns = (rows ?? []) as {
    id: string; return_number: string; customer_id: string; total_amount: number; return_type: string | null;
    requested_by: string | null; created_by: string | null; requested_at: string | null; created_at: string | null;
    first_viewed_at: string | null; notes: string | null;
  }[];
  if (returns.length === 0) return { ok: true, data: [] };

  const retIds = returns.map((r) => r.id);
  const custIds = [...new Set(returns.map((r) => r.customer_id))];
  const reqIds = [...new Set(returns.map((r) => r.requested_by ?? r.created_by).filter((x): x is string => !!x))];

  const [{ data: lineRows }, { data: custRows }, { data: profRows }] = await Promise.all([
    supabase.from('erp_sales_return_lines').select('return_id, product_id').in('return_id', retIds),
    supabase.from('erp_customers').select('id, name, name_ar, code').in('id', custIds),
    reqIds.length ? supabase.from('erp_profiles').select('id, full_name').in('id', reqIds) : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
  ]);

  const linesByReturn = new Map<string, string[]>();
  for (const l of (lineRows ?? []) as { return_id: string; product_id: string }[]) {
    const arr = linesByReturn.get(l.return_id) ?? [];
    arr.push(l.product_id);
    linesByReturn.set(l.return_id, arr);
  }
  const custById = new Map(((custRows ?? []) as { id: string; name: string; name_ar: string | null; code: string }[]).map((c) => [c.id, c]));
  const nameById = new Map(((profRows ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name ?? '']));

  const policy = ctx.companyId ? await loadReturnApprovalPolicy(supabase, ctx.companyId) : DEFAULT_RETURN_POLICY;
  const activeSorted = (policy.rules ?? []).filter((r) => r.active !== false).sort((a, b) => a.priority - b.priority);

  const out: PendingReturnRow[] = [];
  for (const r of returns) {
    const productIds = linesByReturn.get(r.id) ?? [];
    const returnType: ReturnTypeKind = r.return_type === 'damage' ? 'damage' : 'saleable';
    const rctx = await buildReturnContext(supabase, { returnType, value: Number(r.total_amount ?? 0), customerId: r.customer_id, salesmanId: r.requested_by ?? r.created_by, productIds });
    const resolution = resolveReturnDecision(rctx, policy);
    const policyLabel = resolution.matchedRule != null && activeSorted[resolution.matchedRule]
      ? describeRule(activeSorted[resolution.matchedRule])
      : `default:${policy.mode}`;
    const cust = custById.get(r.customer_id);
    out.push({
      id: r.id,
      returnNumber: r.return_number,
      customerName: cust?.name ?? r.customer_id,
      customerCode: cust?.code ?? '',
      requesterName: nameById.get(r.requested_by ?? r.created_by ?? '') || '',
      requestedBy: r.requested_by ?? r.created_by,
      requestedAt: r.requested_at ?? r.created_at,
      firstViewedAt: r.first_viewed_at,
      value: Number(r.total_amount ?? 0),
      returnType,
      lineCount: productIds.length,
      notes: r.notes,
      policyLabel,
      approver: resolution.approver,
      backupApprover: resolution.backupApprover,
    });
  }
  return { ok: true, data: out };
}
