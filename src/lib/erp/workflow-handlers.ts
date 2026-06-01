import 'server-only';
import { createClient } from '@/lib/supabase/server';
import * as subscription from './subscription-service';

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

  // Subscription change (platform-scope): on approval, apply the requested
  // change via the CANONICAL subscription service (the final approver is the
  // platform owner, so the owner-guarded RPCs execute). Stamp the request.
  subscription_change: async (recordId, outcome) => {
    const supabase = await createClient();
    const { data } = await supabase
      .from('erp_subscription_change_requests')
      .select('company_id, kind, plan_key, trial_days, end_date')
      .eq('id', recordId)
      .single();
    const r = data as
      | { company_id: string; kind: string; plan_key: string | null; trial_days: number | null; end_date: string | null }
      | null;
    if (r && outcome === 'approved') {
      const c = r.company_id;
      if (r.kind === 'plan' && r.plan_key) await subscription.changePlan(supabase, c, r.plan_key);
      else if (r.kind === 'trial') await subscription.setTrial(supabase, c, r.trial_days ?? 0);
      else if (r.kind === 'renew' && r.end_date) await subscription.setPeriodEnd(supabase, c, r.end_date);
      else if (r.kind === 'suspend') await subscription.setStatus(supabase, c, 'suspended');
      else if (r.kind === 'reactivate') await subscription.setStatus(supabase, c, 'active');
      else if (r.kind === 'cancel') await subscription.setStatus(supabase, c, 'cancelled');
    }
    await supabase.from('erp_subscription_change_requests').update({ status: outcome }).eq('id', recordId);
  },

  // Onboarding (platform-scope): on approval, provision the tenant via the
  // canonical subscription service (plan + optional trial → activates) and mark
  // setup done. Runs as the approving platform owner. Stamp the request.
  onboarding: async (recordId, outcome) => {
    const supabase = await createClient();
    const { data } = await supabase
      .from('erp_onboarding_requests')
      .select('company_id, plan_key, trial_days')
      .eq('id', recordId)
      .single();
    const r = data as { company_id: string; plan_key: string | null; trial_days: number | null } | null;
    if (r && outcome === 'approved') {
      await subscription.seedSubscription(supabase, {
        companyId: r.company_id,
        planKey: r.plan_key || 'standard',
        currency: 'EGP',
        interval: 'monthly',
        trialDays: r.trial_days ?? 0,
      });
      await supabase.from('erp_companies').update({ setup_done: true }).eq('id', r.company_id);
    }
    await supabase.from('erp_onboarding_requests').update({ status: outcome }).eq('id', recordId);
  },

  // Module activation (platform-scope): on approval, enable/disable the requested
  // module via the same entitlement table the Control Center uses. Runs as the
  // approving platform owner. Stamp the request.
  module_request: async (recordId, outcome) => {
    const supabase = await createClient();
    const { data } = await supabase
      .from('erp_module_requests')
      .select('company_id, module_key, enable')
      .eq('id', recordId)
      .single();
    const r = data as { company_id: string; module_key: string; enable: boolean } | null;
    if (r && outcome === 'approved') {
      await supabase
        .from('erp_company_modules')
        .upsert({ company_id: r.company_id, module: r.module_key, enabled: r.enable }, { onConflict: 'company_id,module' });
    }
    await supabase.from('erp_module_requests').update({ status: outcome }).eq('id', recordId);
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
