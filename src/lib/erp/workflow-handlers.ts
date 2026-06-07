import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { emitDomainEvent, EVENT, type EventType } from '@/lib/events/producer';

/** Entities that emit an `*.approved` domain event when their workflow outcome is
 *  approved (catalog-typed; reuses the event-producer backbone). */
const APPROVED_EVENT: Record<string, EventType> = {
  customer: EVENT.CUSTOMER_APPROVED,
  order: EVENT.ORDER_APPROVED,
};

/** ── Workflow outcome handlers (the only entity-aware part) ─────────────────
 *  The engine is entity-agnostic; what an approval/rejection DOES to the source
 *  record is pluggable here, keyed by entity — "build once, reuse everywhere".
 *  Register a new entity's outcome to put it on the same engine (customer data
 *  updates, credit-limit / trade-spend / purchase approvals, expiry decisions…).
 *  Handlers run as the deciding user (RLS applies). */

export type WorkflowOutcome = 'approved' | 'rejected';
type Handler = (recordId: string, outcome: WorkflowOutcome, comment?: string | null) => Promise<void>;

const HANDLERS: Record<string, Handler> = {
  // Customer onboarding: approval marks the customer approved (sellable); rejection
  // sets the Rejected state + stores the (mandatory) reason. `is_approved` mirrors
  // approval_status so every existing sales gate keeps working unchanged.
  customer: async (recordId, outcome, comment) => {
    const supabase = await createClient();
    await supabase
      .from('erp_customers')
      .update({
        approval_status: outcome === 'approved' ? 'approved' : 'rejected',
        is_approved: outcome === 'approved',
        rejection_reason: outcome === 'rejected' ? (comment ?? null) : null,
      })
      .eq('id', recordId);
  },

  // Staged sensitive change: on approve APPLY the staged values to the (still
  // sellable) customer; on reject DISCARD them + store the reason. The customer's
  // live values were never touched while the change was pending.
  customer_change_request: async (recordId, outcome, comment) => {
    const supabase = await createClient();
    const { data: req } = await supabase
      .from('erp_customer_change_requests')
      .select('customer_id, changes')
      .eq('id', recordId)
      .single();
    const r = req as { customer_id: string; changes: Record<string, unknown> } | null;
    if (r && outcome === 'approved' && r.changes && Object.keys(r.changes).length > 0) {
      await supabase.from('erp_customers').update(r.changes).eq('id', r.customer_id);
    }
    await supabase
      .from('erp_customer_change_requests')
      .update({ status: outcome, reason: outcome === 'rejected' ? (comment ?? null) : null, decided_at: new Date().toISOString() })
      .eq('id', recordId);
  },

  // Credit limit approval: on approve, apply the requested limit to the customer;
  // either way, stamp the request's final status.
  credit_limit_request: async (recordId, outcome) => {
    const supabase = await createClient();
    const { data: req } = await supabase
      .from('erp_credit_limit_requests')
      .select('customer_id, requested_limit')
      .eq('id', recordId)
      .single();
    const r = req as { customer_id: string; requested_limit: number } | null;
    if (r && outcome === 'approved') {
      await supabase.from('erp_customers').update({ credit_limit: r.requested_limit }).eq('id', r.customer_id);
    }
    await supabase.from('erp_credit_limit_requests').update({ status: outcome }).eq('id', recordId);
  },
};

export function hasWorkflowHandler(entity: string): boolean {
  return entity in HANDLERS;
}

/** Apply the per-entity outcome after a workflow completes (no-op if unmapped).
 *  `comment` carries the decision note (mandatory on reject for customer flows). */
export async function applyWorkflowOutcome(
  entity: string,
  recordId: string,
  outcome: WorkflowOutcome,
  comment?: string | null,
): Promise<void> {
  const h = HANDLERS[entity];
  if (h) await h(recordId, outcome, comment);
  // Emit the entity's `*.approved` domain event on approval (flag-gated backbone).
  if (outcome === 'approved' && APPROVED_EVENT[entity]) {
    await emitDomainEvent({ eventType: APPROVED_EVENT[entity], entity, recordId });
  }
}
