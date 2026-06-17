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

  // Trade-spend (P1): approval activates the promotion; rejection cancels it.
  // Same status transitions as the legacy direct actions, now engine-driven.
  trade_promotion: async (recordId, outcome) => {
    const supabase = await createClient();
    await supabase
      .from('erp_trade_promotions')
      .update({ status: outcome === 'approved' ? 'approved' : 'cancelled' })
      .eq('id', recordId);
  },

  // Load request (P2): on approve, run the existing atomic stock-move RPC
  // (reuses the proven logic); on reject, mark the request rejected. Runs as the
  // deciding user (who holds stock_request.approve via the engine's permission step).
  stock_request: async (recordId, outcome) => {
    const supabase = await createClient();
    if (outcome === 'approved') {
      await supabase.rpc('erp_approve_stock_request', { p_request_id: recordId });
    } else {
      await supabase.from('erp_stock_requests').update({ status: 'rejected' }).eq('id', recordId).eq('status', 'pending');
    }
  },

  // ── P2 field workflows: each reuses the existing decision RPC as its handler ──
  // Day-close exception: approve runs the existing close RPC; reject reopens the
  // day (close_status back to 'open') so the rep can retry. (No reject RPC exists.)
  work_session: async (recordId, outcome) => {
    const supabase = await createClient();
    if (outcome === 'approved') {
      await supabase.rpc('erp_approve_day_close', { p_work_session_id: recordId });
    } else {
      await supabase.from('erp_work_sessions').update({ close_status: 'open' }).eq('id', recordId).eq('close_status', 'pending_approval');
    }
  },

  // Out-of-route visit: the existing decide RPC handles both approve and reject.
  visit_compliance: async (recordId, outcome, comment) => {
    const supabase = await createClient();
    await supabase.rpc('erp_decide_visit_compliance', {
      p_id: recordId, p_approve: outcome === 'approved', p_note: comment ?? null,
    });
  },

  // Customer transfer: approve runs the existing apply RPC; reject marks rejected.
  customer_transfer: async (recordId, outcome) => {
    const supabase = await createClient();
    if (outcome === 'approved') {
      await supabase.rpc('erp_approve_customer_transfer', { p_transfer_id: recordId });
    } else {
      await supabase.from('erp_customer_transfers').update({ status: 'rejected' }).eq('id', recordId).eq('status', 'pending');
    }
  },

  // Van (stock) transfer: reuse the existing approve / reject RPCs.
  van_transfer: async (recordId, outcome, comment) => {
    const supabase = await createClient();
    if (outcome === 'approved') {
      await supabase.rpc('erp_approve_van_transfer', { p_id: recordId });
    } else {
      await supabase.rpc('erp_reject_van_transfer', { p_id: recordId, p_reason: comment ?? '' });
    }
  },

  // Van reconciliation: reuse the existing settle / reject RPCs.
  van_reconciliation: async (recordId, outcome, comment) => {
    const supabase = await createClient();
    if (outcome === 'approved') {
      await supabase.rpc('erp_settle_van_reconciliation', { p_id: recordId });
    } else {
      await supabase.rpc('erp_reject_van_reconciliation', { p_id: recordId, p_reason: comment ?? '' });
    }
  },

  // Price-change (P1): on approve, apply the requested price to the product;
  // either way, stamp the request's final status. The live price is untouched
  // while the request is pending.
  price_change_request: async (recordId, outcome) => {
    const supabase = await createClient();
    const { data: req } = await supabase
      .from('erp_price_change_requests')
      .select('product_id, requested_price')
      .eq('id', recordId)
      .single();
    const r = req as { product_id: string | null; requested_price: number | null } | null;
    if (r && outcome === 'approved' && r.product_id != null && r.requested_price != null) {
      await supabase.from('erp_products_catalog').update({ sell_price: r.requested_price }).eq('id', r.product_id);
    }
    await supabase
      .from('erp_price_change_requests')
      .update({ status: outcome === 'approved' ? 'approved' : 'rejected' })
      .eq('id', recordId);
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
