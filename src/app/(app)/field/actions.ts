'use server';

import { createClient } from '@/lib/supabase/server';
import { requireAuth, type ActionResult } from '@/lib/erp/guards';
import { hasPermission } from '@/lib/erp/permissions';
import { today } from '@/lib/erp/work-session';
import type { JourneySortMode } from '@/lib/erp/journey-sort';
import { APPROVAL_DAYCLOSE, APPROVAL_VISIT, APPROVAL_CUSTTRANSFER, APPROVAL_VANTRANSFER } from '@/lib/erp/approval-flags';
import { dayCloseChainActive, submitDayClose } from '@/lib/van-sales/day-close-server';
import { logAudit } from '@/lib/erp/audit';
import { auditEnvelope } from '@/lib/erp/audit-envelope';

/** ── FMCG field-execution server actions ───────────────────────────────────
 *  Thin, permission-gated wrappers over the validated 0128–0134 RPCs. Each
 *  matches the action's granular permission as defense-in-depth (the RPCs also
 *  self-guard). All return ActionResult; RLS scopes every read/write. */

// ── Today's journey ──────────────────────────────────────────────────────────

export interface JourneyStopRow {
  plan_id: string;
  customer_id: string;
  customer_code: string | null;
  customer_name: string | null;
  customer_name_ar: string | null;
  route_id: string | null;
  sequence: number;
  planned_time: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  address: string | null;
  gps_radius: number | null;
}

export interface TodayJourneyData {
  workSessionId: string;
  date: string;
  sortMode: JourneySortMode;
  stops: JourneyStopRow[];
  /** customer_ids already visited today (to compute coverage). */
  visited: string[];
}

/**
 * Resolve the caller's open work session for today (creating one for their
 * default branch when none exists), then return today's planned journey.
 *
 * Work-session resolution: a session is keyed by (salesman_id, work_date). We
 * look up the caller's open session for today; if absent we insert one for the
 * caller's default branch (falling back to the first membership). The company's
 * journey_sort_mode is read from erp_fmcg_settings (default 'nearest').
 */
export async function loadTodayJourney(): Promise<ActionResult<TodayJourneyData>> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error };
  if (!hasPermission(ctx, 'field.sales')) return { ok: false, error: 'unauthorized' };

  const supabase = await createClient();
  const date = today();

  // 1) Resolve / create the open work session for today.
  const { data: existing } = await supabase
    .from('erp_work_sessions')
    .select('id, status')
    .eq('salesman_id', ctx.userId)
    .eq('work_date', date)
    .maybeSingle();

  let workSessionId = existing?.id as string | undefined;
  if (!workSessionId) {
    const branchId =
      ctx.memberships.find((m) => m.is_default)?.branch.id ??
      ctx.memberships[0]?.branch.id ??
      null;
    if (!branchId) return { ok: false, error: 'no_branch' };

    const { data: created, error: insErr } = await supabase
      .from('erp_work_sessions')
      .insert({ branch_id: branchId, salesman_id: ctx.userId, work_date: date, status: 'open' })
      .select('id')
      .single();
    if (insErr || !created) {
      // Race: another insert may have won (UNIQUE salesman_id, work_date) — re-read.
      const { data: again } = await supabase
        .from('erp_work_sessions')
        .select('id')
        .eq('salesman_id', ctx.userId)
        .eq('work_date', date)
        .maybeSingle();
      if (!again?.id) return { ok: false, error: insErr?.message ?? 'session_failed' };
      workSessionId = again.id as string;
    } else {
      workSessionId = created.id as string;
    }
  }

  // 2) Company journey sort mode.
  let sortMode: JourneySortMode = 'nearest';
  if (ctx.companyId) {
    const { data: settings } = await supabase
      .from('erp_fmcg_settings')
      .select('journey_sort_mode')
      .eq('company_id', ctx.companyId)
      .maybeSingle();
    if (settings?.journey_sort_mode) sortMode = settings.journey_sort_mode as JourneySortMode;
  }

  // 3) Today's planned stops.
  const { data: stops, error: jErr } = await supabase.rpc('erp_today_journey', {
    p_salesman: ctx.userId,
    p_date: date,
  });
  if (jErr) return { ok: false, error: jErr.message };

  // 4) Customers already visited today (coverage).
  const { data: visits } = await supabase
    .from('erp_visits')
    .select('customer_id')
    .eq('salesman_id', ctx.userId)
    .eq('visit_date', date);
  const visited = [...new Set(((visits as { customer_id: string }[]) ?? []).map((v) => v.customer_id))];

  return {
    ok: true,
    data: {
      workSessionId,
      date,
      sortMode,
      stops: (stops as JourneyStopRow[]) ?? [],
      visited,
    },
  };
}

// ── Check-in ─────────────────────────────────────────────────────────────────

export interface CheckInInput {
  customerId: string;
  lat: number | null;
  lng: number | null;
  workSessionId: string;
  reason?: string | null;
  force?: boolean;
}

/** Record a visit check-in. `force` (with visit.override_gps) overrides a GPS
 *  violation; without it the RPC may return a blocked/pending result. */
export async function checkInVisit(input: CheckInInput): Promise<ActionResult> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error };
  if (!hasPermission(ctx, 'field.sales')) return { ok: false, error: 'unauthorized' };
  if (input.force && !hasPermission(ctx, 'visit.override_gps')) {
    return { ok: false, error: 'unauthorized' };
  }

  const supabase = await createClient();
  const { data, error: rpcErr } = await supabase.rpc('erp_check_in_visit', {
    p_customer_id: input.customerId,
    p_lat: input.lat,
    p_lng: input.lng,
    p_work_session_id: input.workSessionId,
    p_reason: input.reason ?? null,
    p_force: input.force ?? false,
  });
  if (rpcErr) return { ok: false, error: rpcErr.message };

  // P2 (flag KAKO_APPROVAL_VISIT): when the check-in logs a pending compliance
  // exception, route it through the engine. Flag OFF ⇒ skipped (legacy path).
  const complianceId = (data as { compliance_id?: string } | null)?.compliance_id;
  if (APPROVAL_VISIT() && complianceId) {
    const { data: comp } = await supabase.from('erp_visit_compliance').select('status').eq('id', complianceId).maybeSingle();
    if ((comp as { status?: string } | null)?.status === 'pending_approval') {
      await supabase.rpc('erp_workflow_start', {
        p_key: 'visit_compliance_approval', p_entity: 'visit_compliance', p_record_id: complianceId, p_context: {},
      });
    }
  }
  return { ok: true, data };
}

/** Approve / reject an out-of-route or GPS visit-compliance exception. */
export async function decideVisitCompliance(
  complianceId: string,
  approve: boolean,
  note?: string,
): Promise<ActionResult> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error };
  if (!hasPermission(ctx, 'visit.approve_out_of_route')) return { ok: false, error: 'unauthorized' };

  const supabase = await createClient();
  // CV-4: capture the pre-decision context for the G5 audit envelope.
  const { data: before } = await supabase
    .from('erp_visit_compliance')
    .select('kind, status, visit_id, customer_lat, customer_lng, distance_m')
    .eq('id', complianceId)
    .maybeSingle();
  const prev = before as { kind?: string; status?: string; visit_id?: string; distance_m?: number | null } | null;

  const { data, error: rpcErr } = await supabase.rpc('erp_decide_visit_compliance', {
    p_id: complianceId,
    p_approve: approve,
    p_note: note ?? null,
  });
  if (rpcErr) return { ok: false, error: rpcErr.message };

  // CV-4: structured governance audit on the GPS/route compliance decision —
  // same G5 envelope used for customer status/credit/data changes.
  await logAudit(supabase, {
    action: approve ? 'approve' : 'reject',
    entity: 'visit_compliance',
    entityId: complianceId,
    details: auditEnvelope({
      field: 'status',
      oldValue: prev?.status ?? 'pending_approval',
      newValue: approve ? 'approved' : 'rejected',
      role: ctx.topRole,
      reason: note ?? null,
      requestRef: complianceId,
      event: approve ? 'compliance_approved' : 'compliance_rejected',
      extra: { kind: prev?.kind ?? null, visit_id: prev?.visit_id ?? null, distance_m: prev?.distance_m ?? null },
    }),
    companyId: ctx.companyId,
  });
  return { ok: true, data };
}

// ── Day close ────────────────────────────────────────────────────────────────

export interface SkipReason {
  customer_id?: string;
  reason: string;
}

/** Close the working day: reconciles coverage and may go pending_approval. */
export async function closeDay(
  workSessionId: string,
  skipReasons: SkipReason[] = [],
  bulkReason?: string,
): Promise<ActionResult> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error };
  if (!hasPermission(ctx, 'day.close') && !hasPermission(ctx, 'day.close.submit')) return { ok: false, error: 'unauthorized' };

  const supabase = await createClient();

  // End Day Approval (platform.day_close_approval): when the company runs an
  // approval chain, End Day SUBMITS (locks the day, status pending_<first stage>)
  // instead of closing. Surfaced to existing callers as close_status
  // 'pending_approval' so the journey screen shows the pending state. Flag OFF or
  // no chain ⇒ the legacy direct close below is unchanged.
  const { active } = await dayCloseChainActive(supabase, ctx);
  if (active) {
    const sub = await submitDayClose(workSessionId);
    if (!sub.ok || !sub.data) return { ok: false, error: sub.error };
    return { ok: true, data: { close_status: 'pending_approval', day_close_status: sub.data.status, request_id: sub.data.requestId } };
  }

  const { data, error: rpcErr } = await supabase.rpc('erp_close_day', {
    p_work_session_id: workSessionId,
    p_skip_reasons: skipReasons,
    p_bulk_reason: bulkReason ?? null,
  });
  if (rpcErr) return { ok: false, error: rpcErr.message };

  // P2 (flag KAKO_APPROVAL_DAYCLOSE): when the close goes pending_approval,
  // route it through the engine (branch-scoped to the session's branch). Flag
  // OFF ⇒ skipped; the legacy field-queue day-close approval is unchanged.
  if (APPROVAL_DAYCLOSE() && (data as { close_status?: string } | null)?.close_status === 'pending_approval') {
    const { data: ws } = await supabase.from('erp_work_sessions').select('branch_id').eq('id', workSessionId).maybeSingle();
    await supabase.rpc('erp_workflow_start', {
      p_key: 'day_close_approval', p_entity: 'work_session', p_record_id: workSessionId,
      p_context: { branch_id: (ws as { branch_id?: string } | null)?.branch_id ?? null },
    });
  }
  return { ok: true, data };
}

/** Approve a pending day-close exception (coverage below threshold). */
export async function approveDayClose(workSessionId: string): Promise<ActionResult> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error };
  if (!hasPermission(ctx, 'day.approve_close_exception')) return { ok: false, error: 'unauthorized' };

  const supabase = await createClient();
  const { data, error: rpcErr } = await supabase.rpc('erp_approve_day_close', {
    p_work_session_id: workSessionId,
  });
  if (rpcErr) return { ok: false, error: rpcErr.message };
  return { ok: true, data };
}

// ── Customer / user transfers ─────────────────────────────────────────────────

export interface CustomerTransferInput {
  customerId: string;
  toRegionId?: string | null;
  toBranchId?: string | null;
  toRouteId?: string | null;
  toSalesmanId?: string | null;
  reason?: string | null;
  requireApproval?: boolean;
}

export async function transferCustomer(input: CustomerTransferInput): Promise<ActionResult> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error };
  if (!hasPermission(ctx, 'customer.transfer')) return { ok: false, error: 'unauthorized' };

  const supabase = await createClient();
  const { data, error: rpcErr } = await supabase.rpc('erp_transfer_customer', {
    p_customer_id: input.customerId,
    p_to_region_id: input.toRegionId ?? null,
    p_to_branch_id: input.toBranchId ?? null,
    p_to_route_id: input.toRouteId ?? null,
    p_to_salesman_id: input.toSalesmanId ?? null,
    p_reason: input.reason ?? null,
    p_require_approval: input.requireApproval ?? false,
  });
  if (rpcErr) return { ok: false, error: rpcErr.message };

  // P2 (flag KAKO_APPROVAL_CUSTTRANSFER): when the transfer is pending, route it
  // through the engine (company-wide — transfers are cross-branch). Flag OFF ⇒ skipped.
  const ctd = data as { transfer_id?: string; status?: string } | null;
  if (APPROVAL_CUSTTRANSFER() && ctd?.transfer_id && ctd?.status === 'pending') {
    await supabase.rpc('erp_workflow_start', {
      p_key: 'customer_transfer_approval', p_entity: 'customer_transfer', p_record_id: ctd.transfer_id, p_context: {},
    });
  }
  return { ok: true, data };
}

export async function approveCustomerTransfer(transferId: string): Promise<ActionResult> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error };
  if (!hasPermission(ctx, 'customer.transfer')) return { ok: false, error: 'unauthorized' };

  const supabase = await createClient();
  const { data, error: rpcErr } = await supabase.rpc('erp_approve_customer_transfer', {
    p_transfer_id: transferId,
  });
  if (rpcErr) return { ok: false, error: rpcErr.message };
  return { ok: true, data };
}

export interface UserTransferInput {
  userId: string;
  currentBranchId?: string | null;
  toBranchId?: string | null;
  toRole?: string | null;
  toReportsTo?: string | null;
  moveCustomers?: boolean;
  reason?: string | null;
}

export async function transferUser(input: UserTransferInput): Promise<ActionResult> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error };
  if (!hasPermission(ctx, 'user.transfer')) return { ok: false, error: 'unauthorized' };

  const supabase = await createClient();
  const { data, error: rpcErr } = await supabase.rpc('erp_transfer_user', {
    p_user_id: input.userId,
    p_current_branch_id: input.currentBranchId ?? null,
    p_to_branch_id: input.toBranchId ?? null,
    p_to_role: input.toRole ?? null,
    p_to_reports_to: input.toReportsTo ?? null,
    p_move_customers: input.moveCustomers ?? false,
    p_reason: input.reason ?? null,
  });
  if (rpcErr) return { ok: false, error: rpcErr.message };
  return { ok: true, data };
}

// ── Van (stock) transfers ──────────────────────────────────────────────────────

export interface VanTransferLine {
  product_id: string;
  quantity: number;
}

export async function requestVanTransfer(
  fromWarehouseId: string,
  toWarehouseId: string,
  lines: VanTransferLine[],
): Promise<ActionResult> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error };
  if (!hasPermission(ctx, 'stock.transfer')) return { ok: false, error: 'unauthorized' };

  const supabase = await createClient();
  const { data, error: rpcErr } = await supabase.rpc('erp_request_van_transfer', {
    p_from_warehouse_id: fromWarehouseId,
    p_to_warehouse_id: toWarehouseId,
    p_lines: lines,
  });
  if (rpcErr) return { ok: false, error: rpcErr.message };

  // P2 (flag KAKO_APPROVAL_VANTRANSFER): when not auto-approved (status pending),
  // route through the engine. Flag OFF ⇒ skipped (legacy path + auto-approve kept).
  const vtd = data as { transfer_id?: string; status?: string; auto_approved?: boolean } | null;
  if (APPROVAL_VANTRANSFER() && vtd?.transfer_id && vtd?.status === 'pending' && !vtd?.auto_approved) {
    await supabase.rpc('erp_workflow_start', {
      p_key: 'van_transfer_approval', p_entity: 'van_transfer', p_record_id: vtd.transfer_id, p_context: {},
    });
  }
  return { ok: true, data };
}

export async function approveVanTransfer(id: string): Promise<ActionResult> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error };
  if (!hasPermission(ctx, 'stock.transfer.approve')) return { ok: false, error: 'unauthorized' };

  const supabase = await createClient();
  const { data, error: rpcErr } = await supabase.rpc('erp_approve_van_transfer', { p_id: id });
  if (rpcErr) return { ok: false, error: rpcErr.message };
  return { ok: true, data };
}

export async function rejectVanTransfer(id: string, reason: string): Promise<ActionResult> {
  const { ctx, error } = await requireAuth();
  if (error || !ctx) return { ok: false, error };
  if (!hasPermission(ctx, 'stock.transfer.approve')) return { ok: false, error: 'unauthorized' };

  const supabase = await createClient();
  const { data, error: rpcErr } = await supabase.rpc('erp_reject_van_transfer', {
    p_id: id,
    p_reason: reason,
  });
  if (rpcErr) return { ok: false, error: rpcErr.message };
  return { ok: true, data };
}
