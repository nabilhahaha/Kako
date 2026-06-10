'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { emitDomainEvent, EVENT } from '@/lib/events/producer';
import { requireAuth, can, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { getActiveCustomFields } from '@/lib/erp/custom-fields-server';
import { validateCustomValues } from '@/lib/erp/form-schema';
import { coerceCustomValue } from '@/lib/erp/custom-fields';
import { getT } from '@/lib/i18n/server';
import { isCompanyWide } from '@/lib/erp/scope';
import { applyWorkflowOutcome, type WorkflowOutcome } from '@/lib/erp/workflow-handlers';
import { sensitiveChanges } from '@/lib/erp/customer-approval';
import { statusBlocks, statusBlockMessageKey } from '@/lib/erp/customer-status';
import { logAudit } from '@/lib/erp/audit';
import { loadGovernanceInputs } from '@/lib/erp/field-governance-server';
import { resolveLayout, applyWriteAccess } from '@/lib/erp/field-governance';

/** Parse the `custom` JSON bag from a form, validate it against the entity's
 *  active custom-field definitions (server-authoritative), and return the
 *  coerced bag to store in the row's `custom` jsonb. */
async function resolveCustom(
  entity: string,
  raw: FormDataEntryValue | null,
): Promise<{ ok: true; custom: Record<string, unknown> } | { ok: false; error: string }> {
  const defs = await getActiveCustomFields(entity);
  if (defs.length === 0) return { ok: true, custom: {} };
  let values: Record<string, unknown> = {};
  if (raw) { try { values = JSON.parse(String(raw)); } catch { values = {}; } }
  const { ok, errors } = validateCustomValues(defs, values);
  if (!ok) return { ok: false, error: Object.values(errors)[0] };
  const custom: Record<string, unknown> = {};
  for (const d of defs) {
    const v = coerceCustomValue(d, values[d.key]);
    if (v !== undefined) custom[d.key] = v;
  }
  return { ok: true, custom };
}

function num(v: FormDataEntryValue | null): number {
  const n = Number(String(v ?? '').replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

/** A finite number from a form field, or null when blank/invalid (for optional
 *  numeric columns like GPS / payment terms). */
function numOrNull(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? '').replace(/,/g, '').trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Trimmed string or null. */
function strOrNull(v: FormDataEntryValue | null): string | null {
  return String(v ?? '').trim() || null;
}

/** Checkbox → boolean (present + 'true' = checked). */
function boolFromCheckbox(v: FormDataEntryValue | null): boolean {
  return String(v ?? '') === 'true';
}

/** Tri-state select ('' = inherit/null, 'true'/'false' = explicit). */
function triBool(v: FormDataEntryValue | null): boolean | null {
  const s = String(v ?? '').trim();
  if (s === 'true') return true;
  if (s === 'false') return false;
  return null;
}


export async function upsertCustomer(formData: FormData): Promise<ActionResult> {
  const { ctx, error: authErr } = await requireAuth();
  if (authErr || !ctx) return { ok: false, error: authErr ?? 'unauthorized' };
  const { t } = await getT();

  const id = String(formData.get('id') || '').trim();
  const code = String(formData.get('code') || '').trim();
  const name = String(formData.get('name') || '').trim();
  if (!code) return { ok: false, error: t('customers.errCodeRequired') };
  if (!name) return { ok: false, error: t('customers.errNameRequired') };
  if (num(formData.get('credit_limit')) < 0) return { ok: false, error: t('customers.errCreditNegative') };

  const branchId = String(formData.get('branch_id') || '').trim();
  let salesmanId = String(formData.get('salesman_id') || '').trim();
  const visitDay = String(formData.get('visit_day') || '').trim();
  const accountType = strOrNull(formData.get('customer_account_type')) ?? 'independent';
  // FP-CS: status + reason (reason only meaningful for non-active states; the DB
  // also clears it on return to Active).
  const customerStatus = strOrNull(formData.get('customer_status')) ?? 'active';
  const reasonId = customerStatus === 'active' ? null : strOrNull(formData.get('status_reason_id'));
  const reasonNote = customerStatus === 'active' ? null : strOrNull(formData.get('status_reason_note'));

  // D1: a scoped Sales Rep creating a customer self-assigns, so it lands in their
  // visibility (S4) and passes the S4b write-scope instead of erroring/vanishing.
  const roles = ctx.memberships.map((m) => m.role);
  if (!id && !salesmanId && !isCompanyWide(roles) && roles.includes('salesman')) {
    salesmanId = ctx.userId;
  }

  // Custom fields (Dynamic Forms): validated + coerced server-side.
  const cf = await resolveCustom('customer', formData.get('custom'));
  if (!cf.ok) return { ok: false, error: cf.error };

  const rawPayload = {
    code,
    name,
    name_ar: String(formData.get('name_ar') || '').trim() || null,
    phone: String(formData.get('phone') || '').trim() || null,
    email: String(formData.get('email') || '').trim() || null,
    address: String(formData.get('address') || '').trim() || null,
    city: String(formData.get('city') || '').trim() || null,
    tax_number: String(formData.get('tax_number') || '').trim() || null,
    credit_limit: num(formData.get('credit_limit')),
    branch_id: branchId || null,
    salesman_id: salesmanId || null,
    visit_day: visitDay || null,
    // FMCG hierarchy S3 — expanded customer model. FK ids (segment/class/channel
    // → company master data; region/area → S1 entities) are passed through;
    // tenant RLS + FK constraints keep them valid (invalid → insert fails).
    segment_id: strOrNull(formData.get('segment_id')),
    classification_id: strOrNull(formData.get('classification_id')),
    channel_id: strOrNull(formData.get('channel_id')),
    region_id: strOrNull(formData.get('region_id')),
    area_id: strOrNull(formData.get('area_id')),
    latitude: numOrNull(formData.get('latitude')),
    longitude: numOrNull(formData.get('longitude')),
    payment_terms_days: numOrNull(formData.get('payment_terms_days')),
    contact_person: strOrNull(formData.get('contact_person')),
    contact_phone: strOrNull(formData.get('contact_phone')),
    cr_number: strOrNull(formData.get('cr_number')),
    national_address: strOrNull(formData.get('national_address')),
    // FP-0: first-class FMCG hierarchy + master flags. The DB guard trigger
    // enforces same-company + single-level parent; FK/CHECKs reject bad values.
    customer_account_type: accountType,
    parent_customer_id: accountType === 'branch' ? strOrNull(formData.get('parent_customer_id')) : null,
    business_type_id: strOrNull(formData.get('business_type_id')),
    payment_type: strOrNull(formData.get('payment_type')),
    is_vat_registered: boolFromCheckbox(formData.get('is_vat_registered')),
    credit_control_enabled: boolFromCheckbox(formData.get('credit_control_enabled')),
    customer_status: customerStatus,
    requires_customer_approval: triBool(formData.get('requires_customer_approval')),
    status_reason_id: reasonId,
    status_reason_note: reasonNote,
    custom: cf.custom,
  };

  const supabase = await createClient();

  // FP-CS: changing customer_status (suspend / block / activate) requires the
  // customers.change_status permission. Normal edits that leave status unchanged
  // are unaffected. New customers default to 'active' (no permission needed).
  let prevStatus: string | null = null;
  if (id) {
    const { data: prev } = await supabase.from('erp_customers').select('customer_status').eq('id', id).maybeSingle();
    prevStatus = (prev as { customer_status?: string } | null)?.customer_status ?? null;
  }
  const statusChanged = id ? customerStatus !== prevStatus : customerStatus !== 'active';
  // authz P2: alias-covered granular capability (customers.change_status → customers.status.change).
  if (statusChanged && !can(ctx, 'customers.status.change')) {
    return { ok: false, error: t('customers.errStatusDenied') };
  }
  const auditStatus = async (recordId: string) => {
    if (!statusChanged) return;
    await logAudit(supabase, {
      action: 'update', entity: 'customer_status', entityId: recordId,
      details: { previous_status: prevStatus, new_status: customerStatus, reason_id: reasonId, reason_note: reasonNote },
      companyId: ctx.companyId,
    });
  };

  // DFG-3: dynamic field-governance write enforcement (authoritative). With no
  // governance configured this is a no-op (today's behaviour). Drops fields the
  // user can't edit (keeps current value) and rejects empty required fields.
  let payload: Record<string, unknown> = rawPayload;
  const gov = await loadGovernanceInputs(supabase, ctx, 'customer');
  if (gov.fields.length > 0) {
    let currentRow: Record<string, unknown> = {};
    if (id) {
      const { data: cur } = await supabase.from('erp_customers').select('*').eq('id', id).maybeSingle();
      currentRow = (cur as Record<string, unknown>) ?? {};
    }
    const layout = resolveLayout(gov, rawPayload as Record<string, unknown>);
    const resolved = Array.from(layout, ([key, access]) => ({ key, access }));
    const enforced = applyWriteAccess(resolved, rawPayload as Record<string, unknown>, currentRow);
    if (enforced.missingRequired.length > 0) return { ok: false, error: t('customers.errRequiredMissing') };
    payload = enforced.data;
  }

  // Per-company governance toggle (default off = today's behaviour).
  let requireApproval = false;
  if (ctx.companyId) {
    const { data: comp } = await supabase.from('erp_companies').select('customers_require_approval').eq('id', ctx.companyId).maybeSingle();
    requireApproval = !!(comp as { customers_require_approval?: boolean } | null)?.customers_require_approval;
  }

  if (!id) {
    // CREATE: governance ON → Pending (+ start onboarding workflow); else Approved.
    const createPayload = { ...payload, approval_status: requireApproval ? 'pending' : 'approved', is_approved: !requireApproval };
    const { data: row, error } = await supabase.from('erp_customers').insert(createPayload).select('id').single();
    if (error) return { ok: false, error: friendlyDbError(error) };
    if (requireApproval) {
      await supabase.rpc('erp_workflow_start', { p_key: 'customer_onboarding', p_entity: 'customer', p_record_id: (row as { id: string }).id, p_context: {} });
      revalidatePath('/approvals');
    }
    await auditStatus((row as { id: string }).id);
    await emitDomainEvent({ eventType: EVENT.CUSTOMER_CREATED, entity: 'customer', recordId: (row as { id: string }).id });
    revalidatePath('/customers');
    return { ok: true };
  }

  // UPDATE: sensitive change on an APPROVED customer → stage it (customer keeps
  // selling on current values); minor changes apply immediately.
  if (requireApproval) {
    const { data: cur } = await supabase
      .from('erp_customers')
      .select('approval_status, cr_number, tax_number, credit_limit, channel_id, segment_id, classification_id, payment_terms_days')
      .eq('id', id)
      .maybeSingle();
    const current = cur as Record<string, unknown> | null;
    if (current && current.approval_status === 'approved') {
      const changes = sensitiveChanges(payload as unknown as Record<string, unknown>, current);
      if (Object.keys(changes).length > 0) {
        const live: Record<string, unknown> = { ...payload };
        for (const k of Object.keys(changes)) delete live[k]; // don't touch live sensitive values
        const { error: upErr } = await supabase.from('erp_customers').update(live).eq('id', id);
        if (upErr) return { ok: false, error: friendlyDbError(upErr) };
        const { data: req, error: reqErr } = await supabase
          .from('erp_customer_change_requests')
          .insert({ customer_id: id, changes, requested_by: ctx.userId })
          .select('id')
          .single();
        if (reqErr) return { ok: false, error: friendlyDbError(reqErr) };
        const { error: wfErr } = await supabase.rpc('erp_workflow_start', { p_key: 'customer_update', p_entity: 'customer_change_request', p_record_id: (req as { id: string }).id, p_context: {} });
        if (wfErr) return { ok: false, error: friendlyDbError(wfErr) };
        await auditStatus(id);
        revalidatePath('/customers');
        revalidatePath('/approvals');
        return { ok: true };
      }
    }
  }

  const { error } = await supabase.from('erp_customers').update(payload).eq('id', id);
  if (error) return { ok: false, error: friendlyDbError(error) };
  await auditStatus(id);
  await emitDomainEvent({ eventType: EVENT.CUSTOMER_UPDATED, entity: 'customer', recordId: id });
  revalidatePath('/customers');
  return { ok: true };
}

interface ImportRow {
  code: string;
  name: string;
  name_ar?: string;
  phone?: string;
  city?: string;
  credit_limit?: number;
}

/** Bulk import customers (from a parsed Excel/CSV), upserting on code. */
export async function importCustomers(
  rows: ImportRow[],
  branchId: string | null,
  salesmanId: string | null,
): Promise<ActionResult<{ count: number }>> {
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };

  const clean = rows
    .map((r) => ({
      code: String(r.code ?? '').trim(),
      name: String(r.name ?? '').trim(),
      name_ar: r.name_ar?.toString().trim() || null,
      phone: r.phone?.toString().trim() || null,
      city: r.city?.toString().trim() || null,
      credit_limit: Number(r.credit_limit) || 0,
      branch_id: branchId || null,
      salesman_id: salesmanId || null,
    }))
    .filter((r) => r.code && r.name);

  const { t } = await getT();
  if (clean.length === 0) return { ok: false, error: t('customers.errImportNoRows') };

  const supabase = await createClient();
  const { error } = await supabase
    .from('erp_customers')
    .upsert(clean, { onConflict: 'company_id,code' });
  if (error) return { ok: false, error: friendlyDbError(error) };

  revalidatePath('/customers');
  return { ok: true, data: { count: clean.length } };
}

/** Assign a salesman and/or visit day to a customer (journey plan). */
export async function setCustomerJourney(
  id: string,
  salesmanId: string | null,
  visitDay: string | null,
): Promise<ActionResult> {
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };
  const { t } = await getT();
  const supabase = await createClient();
  // Approval gate: don't assign a rep/route to a non-approved customer.
  // FP-CS: a blocked customer also can't be (re)assigned to a rep — but only
  // when actually setting a salesman (clearing/unassigning stays allowed).
  const { data: c } = await supabase.from('erp_customers').select('is_approved, customer_status').eq('id', id).maybeSingle();
  if (c && (c as { is_approved: boolean }).is_approved === false) {
    return { ok: false, error: t('customers.errNotApproved') };
  }
  if (c && salesmanId && statusBlocks((c as { customer_status?: string }).customer_status, 'rep')) {
    return { ok: false, error: t(statusBlockMessageKey((c as { customer_status?: string }).customer_status)) };
  }
  // Role isolation: you may only assign a customer to a rep within your scope
  // (self / team / region / company). Stops a rep handing a customer to anyone.
  if (salesmanId) {
    const { data: canSee } = await supabase.rpc('erp_can_see_user', { p_user: salesmanId });
    if (!canSee) return { ok: false, error: t('customers.errUnauthorized') };
  }
  const { error } = await supabase
    .from('erp_customers')
    .update({ salesman_id: salesmanId || null, visit_day: visitDay || null })
    .eq('id', id);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/customers');
  revalidatePath('/sales/journey');
  return { ok: true };
}

/** Submit a customer for onboarding approval: mark it pending and start the
 *  generic workflow (an approval task routes to the company admin). */
export async function requestCustomerApproval(id: string): Promise<ActionResult> {
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };
  const { t } = await getT();
  if (!id) return { ok: false, error: t('customers.errUnauthorized') };

  const supabase = await createClient();
  await supabase.from('erp_customers').update({ is_approved: false, approval_status: 'pending', rejection_reason: null }).eq('id', id);
  const { error } = await supabase.rpc('erp_workflow_start', {
    p_key: 'customer_onboarding', p_entity: 'customer', p_record_id: id, p_context: {},
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/customers');
  revalidatePath('/approvals');
  return { ok: true };
}

/** Request a credit-limit change for a customer: records the request and starts
 *  the (threshold-based, multi-step) credit_limit_approval workflow. */
export async function requestCreditLimitChange(customerId: string, requestedLimit: number): Promise<ActionResult> {
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };
  const { t } = await getT();
  if (!customerId) return { ok: false, error: t('customers.errUnauthorized') };
  if (!Number.isFinite(requestedLimit) || requestedLimit < 0) return { ok: false, error: t('customers.errImportNoRows') };

  const supabase = await createClient();
  const { data: cust } = await supabase.from('erp_customers').select('credit_limit').eq('id', customerId).maybeSingle();
  const current = (cust as { credit_limit: number } | null)?.credit_limit ?? null;

  const { data: req, error: insErr } = await supabase
    .from('erp_credit_limit_requests')
    .insert({ customer_id: customerId, current_limit: current, requested_limit: requestedLimit })
    .select('id')
    .single();
  if (insErr) return { ok: false, error: friendlyDbError(insErr) };

  const { error } = await supabase.rpc('erp_workflow_start', {
    p_key: 'credit_limit_approval', p_entity: 'credit_limit_request',
    p_record_id: (req as { id: string }).id, p_context: { amount: requestedLimit },
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/customers');
  revalidatePath('/approvals');
  return { ok: true };
}

/** Decide a customer's open onboarding workflow (or fall back to a direct status
 *  set if none exists), gated by the `customers.approve` permission. Routes the
 *  decision through the engine so history + outcome handling are consistent. */
async function decideCustomer(id: string, decision: 'approve' | 'reject', reason?: string): Promise<ActionResult> {
  const { ctx } = await requireAuth();
  const { t } = await getT();
  if (!ctx) return { ok: false, error: t('customers.errUnauthorized') };
  // authz P2: alias-covered granular capability (customers.approve → customers.approval.approve).
  if (!can(ctx, 'customers.approval.approve')) return { ok: false, error: t('customers.errApproveDenied') };
  if (decision === 'reject' && !(reason && reason.trim())) return { ok: false, error: t('customers.errRejectReason') };

  const supabase = await createClient();
  const { data: inst } = await supabase
    .from('erp_workflow_instances')
    .select('id')
    .eq('entity', 'customer').eq('record_id', id).eq('status', 'pending')
    .order('started_at', { ascending: false }).limit(1).maybeSingle();
  if (inst) {
    const { data: task } = await supabase
      .from('erp_workflow_tasks')
      .select('id').eq('instance_id', (inst as { id: string }).id).eq('status', 'pending').limit(1).maybeSingle();
    if (task) {
      const { data, error } = await supabase.rpc('erp_workflow_decide', {
        p_task_id: (task as { id: string }).id, p_decision: decision, p_comment: reason ?? null,
      });
      if (error) return { ok: false, error: error.message };
      const res = (data ?? {}) as { final?: boolean; status?: string; entity?: string; record_id?: string };
      if (res.final && res.entity && res.record_id && (res.status === 'approved' || res.status === 'rejected')) {
        await applyWorkflowOutcome(res.entity, res.record_id, res.status as WorkflowOutcome, reason ?? null);
        if (res.status === 'approved') await emitDomainEvent({ eventType: EVENT.CUSTOMER_APPROVED, entity: 'customer', recordId: id });
      }
      revalidatePath('/customers');
      revalidatePath('/approvals');
      return { ok: true };
    }
  }
  // No open workflow (legacy/auto-approved) → set the status directly.
  await supabase.from('erp_customers').update({
    approval_status: decision === 'approve' ? 'approved' : 'rejected',
    is_approved: decision === 'approve',
    rejection_reason: decision === 'reject' ? (reason ?? null) : null,
  }).eq('id', id);
  if (decision === 'approve') await emitDomainEvent({ eventType: EVENT.CUSTOMER_APPROVED, entity: 'customer', recordId: id });
  revalidatePath('/customers');
  return { ok: true };
}

export async function approveCustomer(id: string): Promise<ActionResult> {
  return decideCustomer(id, 'approve');
}

export async function rejectCustomer(id: string, reason: string): Promise<ActionResult> {
  return decideCustomer(id, 'reject', reason);
}

export async function toggleCustomerActive(
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  const { error: authErr } = await requireAuth();
  if (authErr) return { ok: false, error: authErr };

  const supabase = await createClient();
  const { error } = await supabase
    .from('erp_customers')
    .update({ is_active: isActive })
    .eq('id', id);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/customers');
  return { ok: true };
}
