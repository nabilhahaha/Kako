import { NextRequest, NextResponse } from 'next/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { MOBILE_ENABLED, isApplicable, dedupeMutations, mapVisitVerdict, type OfflineMutation, type SyncStatus, type Verdict } from '@/lib/offline-sync';
import { collectPayment } from '@/app/(app)/rep/actions';
import { submitSurveyResponse } from '@/app/(app)/settings/surveys/actions';
import { submitFormResponse } from '@/app/(app)/forms/actions';
import { confirmLoad } from '@/app/(app)/field/van-sales/actions';
import type { PaymentMethod } from '@/lib/erp/types';
import type { SurveyAnswers } from '@/lib/erp/survey';
import type { FormAnswers } from '@/lib/form-builder';
import type { ConfirmationLineInput } from '@/lib/van-sales';

// Offline sync intake — POST /api/internal/offline-sync. Receives a batch of
// queued field mutations from the PWA, records each EXACTLY-ONCE in
// erp_offline_mutations (unique company_id+idempotency_key), AUTO-APPLIES the safe
// whitelist (apply.ts) server-side, and updates the device session. Company-scoped
// via the caller's session. Flag-gated KAKO_MOBILE.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Body {
  deviceId?: string; appVersion?: string; platform?: string; lat?: number; lng?: number;
  mutations?: OfflineMutation[];
}

export async function POST(req: NextRequest) {
  if (!MOBILE_ENABLED()) return NextResponse.json({ error: 'disabled' }, { status: 404 });

  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!ctx.companyId) return NextResponse.json({ error: 'no company' }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as Body;
  const deviceId = (body.deviceId ?? '').trim();
  const mutations = Array.isArray(body.mutations) ? body.mutations : [];
  const supabase = await createClient();

  // Device session audit (upsert one row per company/device/user).
  if (deviceId) {
    await supabase.from('erp_device_sessions').upsert({
      company_id: ctx.companyId, user_id: ctx.userId, device_id: deviceId,
      app_version: body.appVersion ?? null, platform: body.platform ?? null,
      last_sync_at: new Date().toISOString(), last_lat: body.lat ?? null, last_lng: body.lng ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'company_id,device_id,user_id' });
  }

  const results: { idempotencyKey: string; entity: string; entityId: string | null; status: SyncStatus; verdict?: Verdict | null }[] = [];

  for (const m of dedupeMutations(mutations)) {
    // Exactly-once: if already recorded, return its status/verdict without re-applying.
    const { data: existing } = await supabase
      .from('erp_offline_mutations')
      .select('status, verdict').eq('company_id', ctx.companyId).eq('idempotency_key', m.idempotencyKey).maybeSingle();
    if (existing) {
      results.push({ idempotencyKey: m.idempotencyKey, entity: m.entity, entityId: m.entityId ?? null, status: existing.status as SyncStatus, verdict: (existing.verdict as Verdict | null) ?? null });
      continue;
    }

    let status: SyncStatus = 'pending';
    let conflictReason: string | null = null;
    let verdict: Verdict | null = null;
    let result: Record<string, unknown> | null = null;

    if (isApplicable(m.entity, m.operation)) {
      const applied = await applyMutation(supabase, ctx.companyId, m);
      status = applied.ok ? 'applied' : 'rejected';
      conflictReason = applied.reason ?? null;
      verdict = applied.verdict ?? null;
      result = applied.result ?? null;
    }

    await supabase.from('erp_offline_mutations').insert({
      company_id: ctx.companyId, device_id: m.deviceId || deviceId, user_id: ctx.userId,
      idempotency_key: m.idempotencyKey, entity: m.entity, entity_id: m.entityId ?? null,
      operation: m.operation, payload: m.payload, base_version: m.baseVersion ?? null,
      client_seq: m.clientSeq, client_ts: m.clientTs, status,
      applied_at: status === 'applied' ? new Date().toISOString() : null,
      conflict_reason: conflictReason, verdict, result,
    });

    results.push({ idempotencyKey: m.idempotencyKey, entity: m.entity, entityId: m.entityId ?? null, status, verdict });
  }

  return NextResponse.json({ results });
}

type Db = Awaited<ReturnType<typeof createClient>>;
interface ApplyResult { ok: boolean; reason?: string; verdict?: Verdict; result?: Record<string, unknown> }

// Apply a whitelisted mutation server-side. Each handler reuses the SAME logic as
// the online path (direct insert / domain RPC) — no forked business logic — so the
// server stays authoritative and the device never finalizes ledgered state.
async function applyMutation(db: Db, companyId: string, m: OfflineMutation): Promise<ApplyResult> {
  if (m.entity === 'van_expense' && m.operation === 'create') {
    const p = m.payload as { amount?: unknown; categoryId?: string; warehouseId?: string; notes?: string; expenseDate?: string };
    const amount = Number(p.amount);
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, reason: 'invalid amount' };
    const { error } = await db.from('erp_van_expenses').insert({
      company_id: companyId, warehouse_id: p.warehouseId ?? null, category_id: p.categoryId ?? null,
      amount, notes: p.notes ?? null, expense_date: p.expenseDate ?? new Date().toISOString().slice(0, 10),
    });
    return error ? { ok: false, reason: error.message } : { ok: true, verdict: 'accepted' };
  }

  // Visit check-in: replay the SAME compliance RPC with the CAPTURED time/day, so
  // a visit synced later lands on the day it happened and is validated by the
  // identical logic (valid / out_of_route / gps_violation / blocked). The device
  // showed it as "Pending Validation" until this verdict comes back.
  if (m.entity === 'visit_checkin' && m.operation === 'create') {
    const p = m.payload as {
      customerId?: string; lat?: number | null; lng?: number | null;
      workSessionId?: string | null; reason?: string | null; force?: boolean;
      checkInAt?: string | null; visitDate?: string | null;
    };
    if (!p.customerId) return { ok: false, reason: 'missing customer' };
    const { data, error } = await db.rpc('erp_check_in_visit', {
      p_customer_id: p.customerId,
      p_lat: p.lat ?? null,
      p_lng: p.lng ?? null,
      p_work_session_id: p.workSessionId ?? null,
      p_reason: p.reason ?? null,
      p_force: p.force ?? false,
      p_check_in_at: p.checkInAt ?? null,
      p_visit_date: p.visitDate ?? null,
    });
    if (error) return { ok: false, reason: error.message, verdict: 'exception' };
    const r = (data ?? {}) as { blocked?: boolean; violation?: boolean; out_of_route?: boolean };
    return { ok: true, verdict: mapVisitVerdict(r), result: r as Record<string, unknown> };
  }

  // Collection: SERVER-AUTHORITATIVE. Replay the SAME collectPayment path with the
  // queued idempotency key (erp_record_payment is atomic + idempotent: a repeat key
  // is a no-op, and over-collection / cancelled / cross-branch raise). No GL/cash
  // posting ever happens on the device — it only happens here, on sync.
  if (m.entity === 'collection' && m.operation === 'create') {
    const p = m.payload as {
      invoiceId?: string; branchId?: string; customerId?: string;
      amount?: unknown; paymentMethod?: string; paymentDate?: string;
    };
    const amount = Number(p.amount);
    if (!p.invoiceId || !p.branchId || !p.customerId) return { ok: false, reason: 'missing collection fields', verdict: 'rejected' };
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, reason: 'invalid amount', verdict: 'rejected' };
    const res = await collectPayment({
      invoice_id: p.invoiceId,
      branch_id: p.branchId,
      customer_id: p.customerId,
      amount,
      payment_method: (p.paymentMethod as PaymentMethod) ?? 'cash',
      idempotency_key: m.idempotencyKey,
      payment_date: p.paymentDate,
    });
    return res.ok ? { ok: true, verdict: 'accepted' } : { ok: false, reason: res.error, verdict: 'rejected' };
  }

  // Survey response: reuse submitSurveyResponse (scores server-side, RLS insert,
  // field.sales/survey.manage gated). Exactly-once is handled by the intake layer.
  if (m.entity === 'survey' && m.operation === 'create') {
    const p = m.payload as { surveyId?: string; customerId?: string; visitId?: string | null; answers?: SurveyAnswers };
    if (!p.surveyId || !p.customerId) return { ok: false, reason: 'missing survey ids', verdict: 'rejected' };
    const res = await submitSurveyResponse({
      surveyId: p.surveyId, customerId: p.customerId, visitId: p.visitId ?? null, answers: p.answers ?? {},
    });
    return res.ok ? { ok: true, verdict: 'accepted' } : { ok: false, reason: res.error, verdict: 'rejected' };
  }

  // Form response: reuse submitFormResponse (loads the published version, resolves
  // the bound entity's layout through field-governance, validates + strips
  // ungovernable values, scores, and inserts an IMMUTABLE response). Same path as
  // the online renderer — the device never finalizes anything itself.
  if (m.entity === 'form_response' && m.operation === 'create') {
    const p = m.payload as { formId?: string; formCode?: string; answers?: FormAnswers; entity?: string; recordId?: string };
    if (!p.formId && !p.formCode) return { ok: false, reason: 'missing form ref', verdict: 'form_rejected' };
    const res = await submitFormResponse({
      formId: p.formId, formCode: p.formCode, answers: p.answers ?? {}, entity: p.entity, recordId: p.recordId,
    });
    return res.ok
      ? { ok: true, verdict: 'form_accepted' }
      : { ok: false, reason: res.error === 'validation' ? (res.problems ?? []).join('; ') : res.error, verdict: 'form_rejected' };
  }

  // Van load confirmation: reuse confirmLoad → the SAME atomic, validated RPC
  // (erp_van_confirm_load) that the online path uses. EXACTLY-ONCE by the intake
  // layer; the RPC is itself idempotent per manifest. Stock posts (accepted-qty
  // only) server-side on apply — the device never finalizes the ledger.
  if (m.entity === 'van_load_confirmation' && m.operation === 'create') {
    const p = m.payload as { manifestId?: string; lines?: ConfirmationLineInput[]; notes?: string };
    if (!p.manifestId) return { ok: false, reason: 'missing manifest', verdict: 'load_rejected' };
    const res = await confirmLoad({ manifestId: p.manifestId, lines: p.lines ?? [], notes: p.notes });
    return res.ok
      ? { ok: true, verdict: 'load_confirmed' }
      : { ok: false, reason: res.problems?.length ? res.problems.join('; ') : res.error, verdict: 'load_rejected' };
  }

  return { ok: false, reason: 'no handler' };
}
