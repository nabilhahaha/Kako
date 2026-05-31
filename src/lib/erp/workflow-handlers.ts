import 'server-only';
import { createClient } from '@/lib/supabase/server';

/** ── Workflow outcome handlers (the only entity-aware part) ─────────────────
 *  The engine is entity-agnostic; what an approval/rejection DOES to the source
 *  record is pluggable here, keyed by entity — "build once, reuse everywhere".
 *  Register a new entity's outcome to put it on the same engine (customer data
 *  updates, credit-limit / trade-spend / purchase approvals, expiry decisions…).
 *  Handlers run as the deciding user (RLS applies). */

export type WorkflowOutcome = 'approved' | 'rejected';
type Handler = (recordId: string, outcome: WorkflowOutcome) => Promise<void>;

const HANDLERS: Record<string, Handler> = {
  // Customer onboarding: approval marks the customer approved (sellable);
  // rejection leaves it unapproved.
  customer: async (recordId, outcome) => {
    const supabase = await createClient();
    await supabase.from('erp_customers').update({ is_approved: outcome === 'approved' }).eq('id', recordId);
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

/** Apply the per-entity outcome after a workflow completes (no-op if unmapped). */
export async function applyWorkflowOutcome(entity: string, recordId: string, outcome: WorkflowOutcome): Promise<void> {
  const h = HANDLERS[entity];
  if (h) await h(recordId, outcome);
}
