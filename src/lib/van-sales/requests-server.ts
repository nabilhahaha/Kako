'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getFeatureFlags } from '@/lib/erp/feature-flags';
import { requireAuth, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { hasPermission } from '@/lib/erp/permissions';
import { getT } from '@/lib/i18n/server';
import { formatCurrency } from '@/lib/utils';
import type { UserContext } from '@/lib/erp/auth-context';
import { isVanSalesActive } from './settings-server';
import { salesmanRequestsEnabled, CUSTOMER_REQUEST_KINDS, type CustomerRequestKind } from './sell';
import { distanceMeters } from '@/lib/erp/journey-sort';
import { listAttachments, type AttachmentView } from '@/app/(app)/attachments/actions';

// ============================================================================
// Salesman Requests hub (Phase 1) — a thin facade over the existing request
// backends + a minimal new cash-handover request. Read-only "my requests"
// aggregator + the cash-handover create/decide actions. Flag-gated
// (platform.salesman_requests). No transaction/accounting change.
// ============================================================================

export type RequestKind = 'load' | 'cash_handover' | 'reopen' | CustomerRequestKind;

export interface MyRequest {
  id: string;
  kind: RequestKind;
  status: string;
  /** normalized tone for the badge */
  tone: 'pending' | 'done' | 'rejected';
  amount: number | null;
  createdAt: string;
  /** Load request: the requested vs (warehouse-)approved loading date. */
  requestedDate?: string | null;
  approvedDate?: string | null;
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
    supabase.from('erp_stock_requests').select('id, status, created_at, requested_date, approved_date').eq('requested_by', ctx.userId).order('created_at', { ascending: false }).limit(10),
    supabase.from('erp_cash_handover_requests').select('id, status, amount, created_at').eq('salesman_id', ctx.userId).order('created_at', { ascending: false }).limit(10),
    supabase.from('erp_day_reopen_requests').select('id, status, created_at').eq('requested_by', ctx.userId).order('created_at', { ascending: false }).limit(10),
    supabase.from('erp_customer_requests').select('id, kind, status, created_at').eq('salesman_id', ctx.userId).order('created_at', { ascending: false }).limit(10),
  ]);

  const out: MyRequest[] = [];
  for (const r of (stockRes.data ?? []) as { id: string; status: string; created_at: string; requested_date: string | null; approved_date: string | null }[]) out.push({ id: r.id, kind: 'load', status: r.status, tone: toneOf(r.status), amount: null, createdAt: r.created_at, requestedDate: r.requested_date, approvedDate: r.approved_date });
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
  route_id: string | null; salesman_id: string | null; last_purchase: string | null;
  /** Current lifecycle status (active / inactive / suspended / blocked) — drives the
   *  Reactivation dropdown filter and the close-with-balance business rule. */
  customer_status: string | null;
  /** Outstanding AR balance — a positive value gates Stop/Suspend/Close (Finance only). */
  balance: number | null;
}

async function repBranch(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<string | null> {
  const { data } = await supabase.from('erp_warehouses').select('branch_id')
    .eq('is_van', true).eq('assigned_to', userId).eq('is_active', true).order('code').limit(1).maybeSingle();
  return (data as { branch_id: string } | null)?.branch_id ?? null;
}

/** The rep's branch customers (select + current values for the customer forms). */
export async function loadRequestCustomers(ctx: UserContext): Promise<RequestCustomer[]> {
  const supabase = await createClient();
  const branchId = await repBranch(supabase, ctx.userId);
  if (!branchId) return [];
  const [{ data }, { data: inv }] = await Promise.all([
    supabase.from('erp_customers')
      .select('id, name, name_ar, code, phone, city, address, cr_number, tax_number, credit_limit, payment_terms_days, latitude, longitude, route_id, salesman_id, customer_status, balance')
      .eq('branch_id', branchId).order('name').limit(500),
    supabase.from('erp_invoices').select('customer_id, created_at').eq('branch_id', branchId).order('created_at', { ascending: false }).limit(2000),
  ]);
  // Last purchase date per customer (newest invoice).
  const last = new Map<string, string>();
  for (const r of (inv ?? []) as { customer_id: string; created_at: string }[]) if (!last.has(r.customer_id)) last.set(r.customer_id, String(r.created_at).slice(0, 10));
  return ((data ?? []) as Omit<RequestCustomer, 'last_purchase'>[]).map((c) => ({ ...c, last_purchase: last.get(c.id) ?? null }));
}

export interface RequestRoute { id: string; name: string; code: string | null; rep_id: string | null }

/** The rep's routes (assignment + route-transfer target). */
export async function loadRequestRoutes(ctx: UserContext): Promise<RequestRoute[]> {
  const supabase = await createClient();
  const branchId = await repBranch(supabase, ctx.userId);
  const q = supabase.from('erp_routes').select('id, name, code, rep_id').eq('is_active', true).order('name').limit(200);
  const { data } = branchId ? await q.or(`rep_id.eq.${ctx.userId},branch_id.eq.${branchId}`) : await q.eq('rep_id', ctx.userId);
  return ((data ?? []) as RequestRoute[]);
}

export interface RequestSalesman { id: string; name: string }

/** Salesmen names referenced by the rep's routes/customers (for route-transfer display). */
export async function loadRequestSalesmen(ctx: UserContext): Promise<RequestSalesman[]> {
  const supabase = await createClient();
  const branchId = await repBranch(supabase, ctx.userId);
  if (!branchId) return [];
  const [{ data: routes }, { data: custs }] = await Promise.all([
    supabase.from('erp_routes').select('rep_id').or(`rep_id.eq.${ctx.userId},branch_id.eq.${branchId}`),
    supabase.from('erp_customers').select('salesman_id').eq('branch_id', branchId).limit(500),
  ]);
  const ids = new Set<string>();
  for (const r of (routes ?? []) as { rep_id: string | null }[]) if (r.rep_id) ids.add(r.rep_id);
  for (const c of (custs ?? []) as { salesman_id: string | null }[]) if (c.salesman_id) ids.add(c.salesman_id);
  if (ids.size === 0) return [];
  const { data: profs } = await supabase.from('erp_profiles').select('id, full_name').in('id', [...ids]);
  return ((profs ?? []) as { id: string; full_name: string | null }[]).map((p) => ({ id: p.id, name: p.full_name || p.id.slice(0, 8) }));
}

/** Salesman raises a governed customer request (new / update / GPS / credit / terms). */
export async function requestCustomerChange(input: { kind: CustomerRequestKind; customerId?: string | null; payload: Record<string, unknown> }): Promise<ActionResult<{ requestId: string }>> {
  const { ctx, error: authErr } = await requireAuth();
  if (authErr || !ctx) return { ok: false, error: authErr ?? 'Not authenticated.' };
  const gate = await requestsActive(ctx);
  if (!gate.ok) return gate;
  if (!(CUSTOMER_REQUEST_KINDS as readonly string[]).includes(input.kind)) return { ok: false, error: 'Invalid request.' };

  const supabase = await createClient();

  // ── Customer status-change business rules (server-side, authoritative) ───────
  // Enforced here regardless of any client filtering.
  if (input.kind === 'reactivate' || input.kind === 'close') {
    const { t } = await getT();
    const { data: cust } = await supabase
      .from('erp_customers').select('customer_status, balance')
      .eq('id', input.customerId ?? '').maybeSingle();
    const row = cust as { customer_status: string | null; balance: number | null } | null;

    if (input.kind === 'reactivate') {
      // Reactivation applies ONLY to non-active customers (suspended / closed / inactive).
      if (!row || (row.customer_status ?? 'active') === 'active') {
        return { ok: false, error: t('vanSales.requests.reactivateOnlyInactive') };
      }
    } else {
      // Stop / Suspend / Close: a customer carrying open AR must NOT be closed by the
      // rep/supervisor directly — closing it could weaken collection responsibility.
      // It requires Accountant / Finance authority (accounting.post; admins via ALL).
      const bal = Number(row?.balance ?? 0);
      if (bal > 0 && !(hasPermission(ctx, 'accounting.post') || ctx.isSuperAdmin)) {
        return { ok: false, error: t('vanSales.requests.closeNeedsFinance', { amount: formatCurrency(bal) }) };
      }
    }
  }

  const payload = { ...input.payload };
  if (input.kind === 'new_customer') {
    // Capture the rep's branch so the approver can create the customer in it.
    const branchId = ctx.memberships.find((m) => m.is_default)?.branch.id ?? ctx.memberships[0]?.branch.id ?? null;
    if (branchId) payload.branch_id = branchId;
  }

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

export interface DuplicateMatch { id: string; name: string; code: string; reasons: string[] }
export interface PendingCustomerRequest {
  id: string; kind: RequestKind; customerName: string | null; salesmanName: string;
  payload: Record<string, unknown>; createdAt: string;
  /** Possible existing-customer matches (new_customer only) — name / mobile / CR / VAT / GPS. */
  duplicates: DuplicateMatch[];
  /** Uploaded evidence (storefront / CR / VAT / national address / other). */
  attachments: AttachmentView[];
}

interface DupCandidate { id: string; name: string; code: string; phone: string | null; cr_number: string | null; tax_number: string | null; latitude: number | null; longitude: number | null }

/** Possible duplicates for a new_customer payload: name (contains), mobile, CR,
 *  VAT (exact), or GPS within 120m. Pure over the candidate set. */
function findDuplicates(payload: Record<string, unknown>, candidates: DupCandidate[]): DuplicateMatch[] {
  const s = (v: unknown) => (v == null ? '' : String(v).trim().toLowerCase());
  const name = s(payload.name), mobile = s(payload.mobile), cr = s(payload.cr), vat = s(payload.vat);
  const lat = Number(payload.latitude), lng = Number(payload.longitude);
  const hasGps = Number.isFinite(lat) && Number.isFinite(lng);
  const out: DuplicateMatch[] = [];
  for (const c of candidates) {
    const reasons: string[] = [];
    const cn = s(c.name);
    if (name && cn && (cn === name || cn.includes(name) || name.includes(cn))) reasons.push('name');
    if (mobile && s(c.phone) === mobile) reasons.push('mobile');
    if (cr && s(c.cr_number) === cr) reasons.push('cr');
    if (vat && s(c.tax_number) === vat) reasons.push('vat');
    if (hasGps && c.latitude != null && c.longitude != null) {
      const d = distanceMeters({ latitude: lat, longitude: lng }, { latitude: c.latitude, longitude: c.longitude });
      if (Number.isFinite(d) && d <= 120) reasons.push('gps');
    }
    if (reasons.length > 0) out.push({ id: c.id, name: c.name, code: c.code, reasons });
  }
  return out.slice(0, 8);
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

  // Duplicate detection: load the company's customers ONCE; match per new-customer request.
  const hasNew = rows.some((r) => r.kind === 'new_customer');
  let candidates: DupCandidate[] = [];
  if (hasNew) {
    const { data: cands } = await supabase
      .from('erp_customers')
      .select('id, name, code, phone, cr_number, tax_number, latitude, longitude')
      .limit(2000);
    candidates = (cands ?? []) as DupCandidate[];
  }

  // Attachments per request (storefront / CR / VAT / …), with signed URLs.
  const attByReq = new Map<string, AttachmentView[]>();
  await Promise.all(rows.map(async (r) => { attByReq.set(r.id, await listAttachments('customer_request', r.id)); }));

  return rows.map((r) => ({
    id: r.id, kind: r.kind,
    customerName: r.customer_id ? (custName.get(r.customer_id) ?? null) : ((r.payload?.name as string) ?? null),
    salesmanName: repName.get(r.salesman_id) || r.salesman_id.slice(0, 8),
    payload: r.payload ?? {}, createdAt: r.created_at,
    duplicates: r.kind === 'new_customer' ? findDuplicates(r.payload ?? {}, candidates) : [],
    attachments: attByReq.get(r.id) ?? [],
  }));
}
