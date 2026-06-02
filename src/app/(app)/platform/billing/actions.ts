'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requirePlatformOwner } from '@/lib/erp/platform-guards';
import { isCurrency, toMinor, type BillingInterval, type SubscriptionStatus } from '@/lib/erp/billing';
import * as subscription from '@/lib/erp/subscription-service';

/** ── Billing administration — owner-only server actions ────────────────────
 *  Thin wrappers over the guarded SECURITY DEFINER RPCs (which also sync the
 *  legacy erp_companies subscription fields and write audit rows). Phase 1
 *  billing administration is Platform-Owner only. */

interface Result { ok: boolean; error?: string }

const INTERVALS = ['monthly', 'yearly'];
const STATUSES = ['trial', 'active', 'suspended', 'cancelled', 'expired'];

export async function setPlanPrice(
  planKey: string, currency: string, interval: string, amountMajor: number,
): Promise<Result> {
  const { ctx, error } = await requirePlatformOwner();
  if (!ctx) return { ok: false, error };
  if (!planKey || !isCurrency(currency) || !INTERVALS.includes(interval)) return { ok: false, error: 'invalid input' };
  if (!Number.isFinite(amountMajor) || amountMajor < 0) return { ok: false, error: 'invalid amount' };
  const supabase = await createClient();
  const { error: e } = await supabase.rpc('erp_billing_set_plan_price', {
    p_plan_key: planKey, p_currency: currency, p_interval: interval,
    p_amount_minor: toMinor(amountMajor, currency),
  });
  if (e) return { ok: false, error: e.message };
  revalidatePath('/platform/billing');
  return { ok: true };
}

export async function subscribeCompany(
  companyId: string, planKey: string, currency: string, interval: string, trialDays: number,
): Promise<Result> {
  const { ctx, error } = await requirePlatformOwner();
  if (!ctx) return { ok: false, error };
  if (!companyId || !planKey || !isCurrency(currency) || !INTERVALS.includes(interval))
    return { ok: false, error: 'invalid input' };
  const supabase = await createClient();
  const { error: e } = await subscription.seedSubscription(supabase, {
    companyId, planKey, currency, interval: interval as BillingInterval, trialDays,
  });
  if (e) return { ok: false, error: e.message };
  revalidatePath('/platform/billing');
  return { ok: true };
}

export async function setSubscriptionStatus(companyId: string, status: string): Promise<Result> {
  const { ctx, error } = await requirePlatformOwner();
  if (!ctx) return { ok: false, error };
  if (!companyId || !STATUSES.includes(status)) return { ok: false, error: 'invalid input' };
  const supabase = await createClient();
  const { error: e } = await subscription.setStatus(supabase, companyId, status as SubscriptionStatus);
  if (e) return { ok: false, error: e.message };
  revalidatePath('/platform/billing');
  return { ok: true };
}

export async function issueInvoice(companyId: string): Promise<Result> {
  const { ctx, error } = await requirePlatformOwner();
  if (!ctx) return { ok: false, error };
  if (!companyId) return { ok: false, error: 'invalid input' };
  const supabase = await createClient();
  const { error: e } = await supabase.rpc('erp_billing_issue_invoice', { p_company: companyId });
  if (e) return { ok: false, error: e.message };
  revalidatePath('/platform/billing');
  return { ok: true };
}
