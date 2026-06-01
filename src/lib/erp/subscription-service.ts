import type { SupabaseClient } from '@supabase/supabase-js';
import type { BillingInterval, SubscriptionStatus } from './billing';

/**
 * The ONE application writer of subscription state.
 *
 * Every subscription mutation flows through these helpers, which call the
 * canonical, owner-guarded billing RPCs on `erp_billing_subscriptions` (the
 * single source of truth). The `erp_companies` subscription columns are a
 * read-only cache updated by the database projection trigger — they are never
 * written directly from application code. Keeping every write here is what
 * guarantees "no duplicate write paths".
 *
 * Each function returns the raw Postgrest error (or null) so callers can format
 * it with their own conventions.
 */

type RpcError = { message: string } | null;

/** Seed / replace a company's subscription (optionally starting a trial). */
export async function seedSubscription(
  supabase: SupabaseClient,
  args: { companyId: string; planKey: string; currency: string; interval: BillingInterval; trialDays?: number },
): Promise<{ error: RpcError }> {
  const { error } = await supabase.rpc('erp_billing_subscribe', {
    p_company: args.companyId,
    p_plan_key: args.planKey,
    p_currency: args.currency,
    p_interval: args.interval,
    p_trial_days: Math.max(0, Math.floor(args.trialDays ?? 0)),
  });
  return { error };
}

/** Change the plan only (currency / interval / period / status unchanged). */
export async function changePlan(
  supabase: SupabaseClient,
  companyId: string,
  planKey: string,
): Promise<{ error: RpcError }> {
  const { error } = await supabase.rpc('erp_billing_set_plan', {
    p_company: companyId,
    p_plan_key: planKey,
  });
  return { error };
}

/** Set / extend the paid period end (renew). Reactivates a lapsed tenant. */
export async function setPeriodEnd(
  supabase: SupabaseClient,
  companyId: string,
  end: string,
): Promise<{ error: RpcError }> {
  const { error } = await supabase.rpc('erp_billing_set_period_end', {
    p_company: companyId,
    p_end: end,
  });
  return { error };
}

/** Transition the subscription status (suspend / reactivate / cancel / expire). */
export async function setStatus(
  supabase: SupabaseClient,
  companyId: string,
  status: SubscriptionStatus,
): Promise<{ error: RpcError }> {
  const { error } = await supabase.rpc('erp_billing_set_status', {
    p_company: companyId,
    p_status: status,
  });
  return { error };
}

/** Start a timed trial (days from today) or end it (days <= 0). */
export async function setTrial(
  supabase: SupabaseClient,
  companyId: string,
  days: number,
): Promise<{ error: RpcError }> {
  const { error } = await supabase.rpc('erp_billing_set_trial', {
    p_company: companyId,
    p_days: Math.floor(days),
  });
  return { error };
}
