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
};

export function hasWorkflowHandler(entity: string): boolean {
  return entity in HANDLERS;
}

/** Apply the per-entity outcome after a workflow completes (no-op if unmapped). */
export async function applyWorkflowOutcome(entity: string, recordId: string, outcome: WorkflowOutcome): Promise<void> {
  const h = HANDLERS[entity];
  if (h) await h(recordId, outcome);
}
