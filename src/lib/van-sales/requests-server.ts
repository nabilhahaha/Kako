'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getFeatureFlags } from '@/lib/erp/feature-flags';
import { requireAuth, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { hasPermission } from '@/lib/erp/permissions';
import type { UserContext } from '@/lib/erp/auth-context';
import { isVanSalesActive } from './settings-server';
import { salesmanRequestsEnabled } from './sell';

// ============================================================================
// Salesman Requests hub (Phase 1) — a thin facade over the existing request
// backends + a minimal new cash-handover request. Read-only "my requests"
// aggregator + the cash-handover create/decide actions. Flag-gated
// (platform.salesman_requests). No transaction/accounting change.
// ============================================================================

export type RequestKind = 'load' | 'cash_handover' | 'reopen' | 'new_customer' | 'data_update' | 'gps_correction';

export interface MyRequest {
  id: string;
  kind: RequestKind;
  status: string;
  /** normalized tone for the badge */
  tone: 'pending' | 'done' | 'rejected';
  amount: number | null;
  createdAt: string;
}

const DONE = new Set(['approved', 'applied', 'confirmed', 'loaded', 'completed']);
const REJECTED = new Set(['rejected', 'cancelled']);
const toneOf = (s: string): MyRequest['tone'] => (DONE.has(s) ? 'done' : REJECTED.has(s) ? 'rejected' : 'pending');

async function requestsActive(ctx: UserContext): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  if (!(await isVanSalesActive(supabase, ctx))) return { ok: false, error: 'Van Sales is not enabled.' };
  if (!salesmanRequestsEnabled(await getFeatureFlags(supabase, ctx.companyId!))) return { ok: false, error: 'Requests are not enabled.' };
  return { ok: true };
}

/** The salesman's own recent requests across the Phase-1 backends, newest first. */
export async function loadMyRequests(ctx: UserContext): Promise<MyRequest[]> {
  const supabase = await createClient();
  const [stockRes, cashRes, reopenRes, custRes] = await Promise.all([
    supabase.from('erp_stock_requests').select('id, status, created_at').eq('requested_by', ctx.userId).order('created_at', { ascending: false }).limit(10),
    supabase.from('erp_cash_handover_requests').select('id, status, amount, created_at').eq('salesman_id', ctx.userId).order('created_at', { ascending: false }).limit(10),
    supabase.from('erp_day_reopen_requests').select('id, status, created_at').eq('requested_by', ctx.userId).order('created_at', { ascending: false }).limit(10),
    supabase.from('erp_customer_requests').select('id, kind, status, created_at').eq('salesman_id', ctx.userId).order('created_at', { ascending: false }).limit(10),
  ]);

  const out: MyRequest[] = [];
  for (const r of (stockRes.data ?? []) as { id: string; status: string; created_at: string }[]) out.push({ id: r.id, kind: 'load', status: r.status, tone: toneOf(r.status), amount: null, createdAt: r.created_at });
  for (const r of (cashRes.data ?? []) as { id: string; status: string; amount: number; created_at: string }[]) out.push({ id: r.id, kind: 'cash_handover', status: r.status, tone: toneOf(r.status), amount: Number(r.amount ?? 0), createdAt: r.created_at });
  for (const r of (reopenRes.data ?? []) as { id: string; status: string; created_at: string }[]) out.push({ id: r.id, kind: 'reopen', status: r.status, tone: toneOf(r.status), amount: null, createdAt: r.created_at });
  for (const r of (custRes.data ?? []) as { id: string; kind: RequestKind; status: string; created_at: string }[]) out.push({ id: r.id, kind: r.kind, status: r.status, tone: toneOf(r.status), amount: null, createdAt: r.created_at });

  out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return out.slice(0, 20);
}

/** Salesman declares a cash handover to the office/cashier. */
export async function requestCashHandover(input: { amount: number; note?: string }): Promise<ActionResult<{ requestId: string }>> {
  const { ctx, error: authErr } = await requireAuth();
  if (authErr || !ctx) return { ok: false, error: authErr ?? 'Not authenticated.' };
  const gate = await requestsActive(ctx);
  if (!gate.ok) return gate;
  if (!(input.amount > 0)) return { ok: false, error: 'Enter an amount greater than zero.' };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('erp_request_cash_handover', { p_amount: input.amount, p_note: input.note?.trim() || null });
  if (error) return { ok: false, error: friendlyDbError(error) };
  const row = (Array.isArray(data) ? data[0] : data) as { request_id: string } | undefined;
  if (!row?.request_id) return { ok: false, error: 'Request failed.' };

  revalidatePath('/field/van-sales/requests');
  return { ok: true, data: { requestId: row.request_id } };
}

/** Cashier/supervisor confirms or rejects a cash-handover request. */
export async function decideCashHandover(input: { requestId: string; decision: 'confirm' | 'reject'; note?: string }): Promise<ActionResult<{ status: string }>> {
  const { ctx, error: authErr } = await requireAuth();
  if (authErr || !ctx) return { ok: false, error: authErr ?? 'Not authenticated.' };
  const supabase = await createClient();
  if (!(await isVanSalesActive(supabase, ctx))) return { ok: false, error: 'Van Sales is not enabled.' };
  if (input.decision !== 'confirm' && input.decision !== 'reject') return { ok: false, error: 'Invalid decision.' };

  const { data, error } = await supabase.rpc('erp_decide_cash_handover', { p_request_id: input.requestId, p_decision: input.decision, p_note: input.note?.trim() || null });
  if (error) return { ok: false, error: friendlyDbError(error) };
  const row = (Array.isArray(data) ? data[0] : data) as { status: string } | undefined;
  if (!row?.status) return { ok: false, error: 'Decision failed.' };

  revalidatePath('/field/van-sales/cash-handovers');
  return { ok: true, data: { status: row.status } };
}

export interface PendingCashHandover { id: string; amount: number; note: string | null; createdAt: string; salesmanName: string }

/** Pending cash-handover requests in the company (for confirmers). */
export async function loadPendingCashHandovers(ctx: UserContext): Promise<PendingCashHandover[]> {
  const supabase = await createClient();
  if (!salesmanRequestsEnabled(await getFeatureFlags(supabase, ctx.companyId!))) return [];
  if (!(hasPermission(ctx, 'cash.handover.confirm') || ctx.isSuperAdmin)) return [];

  const { data } = await supabase
    .from('erp_cash_handover_requests')
    .select('id, amount, note, created_at, salesman_id')
    .eq('status', 'pending').order('created_at', { ascending: true });
  const rows = (data ?? []) as { id: string; amount: number; note: string | null; created_at: string; salesman_id: string }[];
  if (rows.length === 0) return [];

  const ids = [...new Set(rows.map((r) => r.salesman_id))];
  const { data: profs } = await supabase.from('erp_profiles').select('id, full_name').in('id', ids);
  const nameById = new Map(((profs ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name ?? '']));
  return rows.map((r) => ({ id: r.id, amount: Number(r.amount ?? 0), note: r.note, createdAt: r.created_at, salesmanName: nameById.get(r.salesman_id) || r.salesman_id.slice(0, 8) }));
}

// ── Governed customer requests (new / data update / GPS) ─────────────────────

export interface RequestCustomer {
  id: string; name: string; name_ar: string | null; code: string;
  phone: string | null; city: string | null; address: string | null;
  cr_number: string | null; tax_number: string | null;
  credit_limit: number | null; payment_terms_days: number | null;
  latitude: number | null; longitude: number | null;
}

/** The rep's branch customers (for the data-update / GPS forms: select + current values). */
export async function loadRequestCustomers(ctx: UserContext): Promise<RequestCustomer[]> {
  const supabase = await createClient();
  const { data: vanRow } = await supabase
    .from('erp_warehouses').select('branch_id')
    .eq('is_van', true).eq('assigned_to', ctx.userId).eq('is_active', true)
    .order('code').limit(1).maybeSingle();
  const branchId = (vanRow as { branch_id: string } | null)?.branch_id;
  if (!branchId) return [];
  const { data } = await supabase
    .from('erp_customers')
    .select('id, name, name_ar, code, phone, city, address, cr_number, tax_number, credit_limit, payment_terms_days, latitude, longitude')
    .eq('branch_id', branchId).order('name').limit(500);
  return ((data ?? []) as RequestCustomer[]);
}

/** Salesman raises a governed customer request (new / data update / GPS). */
export async function requestCustomerChange(input: { kind: RequestKind; customerId?: string | null; payload: Record<string, unknown> }): Promise<ActionResult<{ requestId: string }>> {
  const { ctx, error: authErr } = await requireAuth();
  if (authErr || !ctx) return { ok: false, error: authErr ?? 'Not authenticated.' };
  const gate = await requestsActive(ctx);
  if (!gate.ok) return gate;
  if (input.kind !== 'new_customer' && input.kind !== 'data_update' && input.kind !== 'gps_correction') return { ok: false, error: 'Invalid request.' };

  const payload = { ...input.payload };
  if (input.kind === 'new_customer') {
    // Capture the rep's branch so the approver can create the customer in it.
    const branchId = ctx.memberships.find((m) => m.is_default)?.branch.id ?? ctx.memberships[0]?.branch.id ?? null;
    if (branchId) payload.branch_id = branchId;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('erp_request_customer_change', {
    p_kind: input.kind, p_customer_id: input.customerId ?? null, p_payload: payload,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  const row = (Array.isArray(data) ? data[0] : data) as { request_id: string } | undefined;
  if (!row?.request_id) return { ok: false, error: 'Request failed.' };

  revalidatePath('/field/van-sales/requests');
  return { ok: true, data: { requestId: row.request_id } };
}

/** Approver decides + (on approve) applies a customer request. */
export async function decideCustomerRequest(input: { requestId: string; decision: 'approve' | 'reject'; note?: string }): Promise<ActionResult<{ status: string }>> {
  const { ctx, error: authErr } = await requireAuth();
  if (authErr || !ctx) return { ok: false, error: authErr ?? 'Not authenticated.' };
  const supabase = await createClient();
  if (!(await isVanSalesActive(supabase, ctx))) return { ok: false, error: 'Van Sales is not enabled.' };
  if (input.decision !== 'approve' && input.decision !== 'reject') return { ok: false, error: 'Invalid decision.' };

  const { data, error } = await supabase.rpc('erp_decide_customer_request', { p_request_id: input.requestId, p_decision: input.decision, p_note: input.note?.trim() || null });
  if (error) return { ok: false, error: friendlyDbError(error) };
  const row = (Array.isArray(data) ? data[0] : data) as { status: string } | undefined;
  if (!row?.status) return { ok: false, error: 'Decision failed.' };

  revalidatePath('/field/van-sales/customer-requests');
  revalidatePath('/customers');
  return { ok: true, data: { status: row.status } };
}

export interface PendingCustomerRequest {
  id: string; kind: RequestKind; customerName: string | null; salesmanName: string;
  payload: Record<string, unknown>; createdAt: string;
}

/** Pending customer requests in the company (for approvers). */
export async function loadPendingCustomerRequests(ctx: UserContext): Promise<PendingCustomerRequest[]> {
  const supabase = await createClient();
  if (!salesmanRequestsEnabled(await getFeatureFlags(supabase, ctx.companyId!))) return [];
  if (!(hasPermission(ctx, 'customer.request.approve') || ctx.isSuperAdmin)) return [];

  const { data } = await supabase
    .from('erp_customer_requests')
    .select('id, kind, customer_id, payload, created_at, salesman_id')
    .eq('status', 'pending').order('created_at', { ascending: true });
  const rows = (data ?? []) as { id: string; kind: RequestKind; customer_id: string | null; payload: Record<string, unknown>; created_at: string; salesman_id: string }[];
  if (rows.length === 0) return [];

  const repIds = [...new Set(rows.map((r) => r.salesman_id))];
  const custIds = [...new Set(rows.map((r) => r.customer_id).filter(Boolean) as string[])];
  const [{ data: profs }, custData] = await Promise.all([
    supabase.from('erp_profiles').select('id, full_name').in('id', repIds),
    custIds.length ? supabase.from('erp_customers').select('id, name').in('id', custIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const repName = new Map(((profs ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name ?? '']));
  const custName = new Map((((custData as { data: { id: string; name: string }[] }).data) ?? []).map((c) => [c.id, c.name]));

  return rows.map((r) => ({
    id: r.id, kind: r.kind,
    customerName: r.customer_id ? (custName.get(r.customer_id) ?? null) : ((r.payload?.name as string) ?? null),
    salesmanName: repName.get(r.salesman_id) || r.salesman_id.slice(0, 8),
    payload: r.payload ?? {}, createdAt: r.created_at,
  }));
}
