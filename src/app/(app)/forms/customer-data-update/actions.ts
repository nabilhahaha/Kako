'use server';

import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { recordEvent } from '@/lib/workflow/emit';
import {
  FORM_BUILDER_ENABLED,
  customerDataUpdateForm,
  extractChangeSet,
  hasChanges,
  type FormAnswers,
} from '@/lib/form-builder';
import { submitFormResponse } from '../actions';

/** ── Customer Data Update (8F-2) — workflow integration ─────────────────────
 *  Wraps the generic form submission with the Customer Data Update workflow:
 *  records the immutable, governed, before/after-audited response (reuse), opens
 *  an erp_customer_change_requests row (the workflow's subject record) with the
 *  proposed changes, and emits a domain event so an active customer_data_update
 *  workflow auto-starts (approval → status → notify) via the existing event bus.
 *  Applying approved field changes back to erp_customers is a later increment. */

const FORM_CODE = 'customer_data_update';
const ENTITY = 'customer';
const CHANGE_ENTITY = 'customer_change_request';
const EVENT_TYPE = 'customer_change_request.submitted';

export interface SubmitCustomerDataUpdateResult {
  ok: boolean;
  error?: string;
  problems?: string[];
  responseId?: string;
  changeRequestId?: string;
}

export async function submitCustomerDataUpdate(input: {
  customerId: string;
  answers: FormAnswers;
}): Promise<SubmitCustomerDataUpdateResult> {
  if (!FORM_BUILDER_ENABLED()) return { ok: false, error: 'disabled' };
  if (!input.customerId) return { ok: false, error: 'missing customer' };

  const ctx = await getUserContext();
  if (!ctx) return { ok: false, error: 'unauthorized' };
  if (!hasPermission(ctx, 'field.sales') && !hasPermission(ctx, 'customers.manage')) {
    return { ok: false, error: 'unauthorized' };
  }

  // 1) Immutable, governed, before/after-audited response (the single write path).
  const res = await submitFormResponse({
    formCode: FORM_CODE,
    answers: input.answers,
    entity: ENTITY,
    recordId: input.customerId,
  });
  if (!res.ok) return { ok: false, error: res.error, problems: res.problems };

  // 2) Open the change request (workflow subject). No entity-backed change → the
  //    response stands as an audit record; nothing to route.
  const def = customerDataUpdateForm();
  if (!hasChanges(def, input.answers)) return { ok: true, responseId: res.id };

  const changes = extractChangeSet(def, input.answers);
  const reasonParts = [input.answers.reason, input.answers.reason_detail]
    .filter((v) => typeof v === 'string' && v) as string[];

  const supabase = await createClient();
  const { data: cr, error: crErr } = await supabase
    .from('erp_customer_change_requests')
    .insert({
      customer_id: input.customerId,
      changes,                                   // proposed governed after-values
      reason: reasonParts.join(' — ') || null,
      requested_by: ctx.userId,
      // status defaults to 'pending'; company_id set by trigger; RLS-scoped.
    })
    .select('id')
    .single();
  if (crErr) return { ok: false, error: crErr.message, responseId: res.id };
  const changeRequestId = (cr as { id: string }).id;

  // 3) Emit the domain event — an active customer_data_update workflow (entity
  //    customer_change_request) auto-starts via the dispatcher. Non-fatal.
  await recordEvent({
    eventType: EVENT_TYPE,
    entity: CHANGE_ENTITY,
    recordId: changeRequestId,
    payload: { customer_id: input.customerId, changes, response_id: res.id ?? null },
  });

  return { ok: true, responseId: res.id, changeRequestId };
}
