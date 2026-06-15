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

export type RequestKind = 'load' | 'cash_handover' | 'reopen';

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
  const [stockRes, cashRes, reopenRes] = await Promise.all([
    supabase.from('erp_stock_requests').select('id, status, created_at').eq('requested_by', ctx.userId).order('created_at', { ascending: false }).limit(10),
    supabase.from('erp_cash_handover_requests').select('id, status, amount, created_at').eq('salesman_id', ctx.userId).order('created_at', { ascending: false }).limit(10),
    supabase.from('erp_day_reopen_requests').select('id, status, created_at').eq('requested_by', ctx.userId).order('created_at', { ascending: false }).limit(10),
  ]);

  const out: MyRequest[] = [];
  for (const r of (stockRes.data ?? []) as { id: string; status: string; created_at: string }[]) out.push({ id: r.id, kind: 'load', status: r.status, tone: toneOf(r.status), amount: null, createdAt: r.created_at });
  for (const r of (cashRes.data ?? []) as { id: string; status: string; amount: number; created_at: string }[]) out.push({ id: r.id, kind: 'cash_handover', status: r.status, tone: toneOf(r.status), amount: Number(r.amount ?? 0), createdAt: r.created_at });
  for (const r of (reopenRes.data ?? []) as { id: string; status: string; created_at: string }[]) out.push({ id: r.id, kind: 'reopen', status: r.status, tone: toneOf(r.status), amount: null, createdAt: r.created_at });

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
