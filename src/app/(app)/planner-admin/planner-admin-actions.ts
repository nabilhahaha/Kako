'use server';

import { revalidatePath } from 'next/cache';
import { getUserContext } from '@/lib/erp/auth-context';
import { createServiceClient } from '@/lib/supabase/service';
import {
  isRoutePlannerTenantPlan,
  ROUTE_PLANNER_PLAN_PREFIX,
  ROUTE_PLANNER_PLAN_TRIAL,
  ROUTE_PLANNER_PLAN_MONTHLY,
  ROUTE_PLANNER_PLAN_ANNUAL,
} from '@/lib/erp/route-planner-admin';
import { ROUTE_PLANNER_TRIAL_DAYS } from '@/lib/erp/route-planner-subscription';

/**
 * Route Planner Admin — server actions for the limited, product-scoped console.
 *
 * Every action is gated on `ctx.isRoutePlannerAdmin` AND strictly scoped to Route
 * Planner tenant companies (their `plan_key` starts with `route_planner`). The admin can
 * never touch a full-platform ERP tenant: each mutation re-reads the target company and
 * refuses if it is not a Route Planner tenant. The service-role client is used because a
 * product admin is not a member of these tenants, but the plan-key scope keeps it caged.
 */

export interface PlannerTenantRow {
  id: string;
  name: string;
  planKey: string | null;
  isActive: boolean;
  trialEndsAt: string | null;
  subscriptionStart: string | null;
  subscriptionEnd: string | null;
  createdAt: string;
  updatedAt: string | null;
  /** Best-effort usage stats (null when unavailable). */
  customerCount: number | null;
  routeCount: number | null;
  lastActivity: string | null;
}

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const DAY_MS = 24 * 60 * 60 * 1000;
const isoIn = (days: number) => new Date(Date.now() + days * DAY_MS).toISOString();

async function requireAdmin(): Promise<boolean> {
  const ctx = await getUserContext();
  return Boolean(ctx?.isRoutePlannerAdmin);
}

/** A company is manageable only if it is a Route Planner tenant. */
async function loadScopedCompany(id: string) {
  const svc = createServiceClient();
  const { data } = await svc.from('erp_companies').select('id, plan_key').eq('id', id).maybeSingle();
  if (!data || !isRoutePlannerTenantPlan((data as { plan_key: string | null }).plan_key)) return null;
  return svc;
}

/** Best-effort usage stats for a tenant. Any failure degrades to nulls (UI shows "—"). */
async function tenantStats(svc: ReturnType<typeof createServiceClient>, companyId: string): Promise<{ customerCount: number | null; routeCount: number | null; lastActivity: string | null }> {
  try {
    const [{ count }, routesRes, activityRes] = await Promise.all([
      svc.from('erp_customers').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
      svc.from('erp_customers').select('route_id').eq('company_id', companyId).not('route_id', 'is', null).limit(5000),
      svc.from('erp_customers').select('updated_at').eq('company_id', companyId).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    const routeCount = routesRes.data ? new Set((routesRes.data as { route_id: string | null }[]).map((r) => r.route_id)).size : null;
    const lastActivity = (activityRes.data as { updated_at: string } | null)?.updated_at ?? null;
    return { customerCount: count ?? null, routeCount, lastActivity };
  } catch {
    return { customerCount: null, routeCount: null, lastActivity: null };
  }
}

export async function listRoutePlannerTenants(): Promise<Result<PlannerTenantRow[]>> {
  if (!(await requireAdmin())) return { ok: false, error: 'err_unauthorized' };
  try {
    const svc = createServiceClient();
    const { data, error } = await svc
      .from('erp_companies')
      .select('id, name, plan_key, is_active, trial_ends_at, subscription_start, subscription_end, created_at, updated_at')
      .like('plan_key', `${ROUTE_PLANNER_PLAN_PREFIX}%`)
      .order('created_at', { ascending: false });
    if (error) return { ok: false, error: 'err_query' };
    const tenants = await Promise.all((data ?? []).map(async (c): Promise<PlannerTenantRow> => {
      const stats = await tenantStats(svc, c.id);
      return {
        id: c.id, name: c.name, planKey: c.plan_key, isActive: c.is_active,
        trialEndsAt: c.trial_ends_at, subscriptionStart: c.subscription_start,
        subscriptionEnd: c.subscription_end, createdAt: c.created_at, updatedAt: c.updated_at,
        customerCount: stats.customerCount, routeCount: stats.routeCount, lastActivity: stats.lastActivity,
      };
    }));
    return { ok: true, data: tenants };
  } catch {
    return { ok: false, error: 'err_query' };
  }
}

/**
 * Ensure the Route Planner plan keys exist in erp_plans. `erp_companies.plan_key` is a
 * FK to erp_plans(key), so a company can only carry a `route_planner_*` plan once these
 * rows exist (migration 0352 seeds them; this is a self-healing belt-and-suspenders).
 */
async function ensureRoutePlannerPlans(svc: ReturnType<typeof createServiceClient>): Promise<void> {
  await svc.from('erp_plans').upsert([
    { key: ROUTE_PLANNER_PLAN_TRIAL, name_ar: 'مخطط الخطوط — تجربة', rank: 0 },
    { key: ROUTE_PLANNER_PLAN_MONTHLY, name_ar: 'مخطط الخطوط — شهري', rank: 0 },
    { key: ROUTE_PLANNER_PLAN_ANNUAL, name_ar: 'مخطط الخطوط — سنوي', rank: 0 },
  ], { onConflict: 'key', ignoreDuplicates: true });
}

export async function createRoutePlannerTenant(name: string): Promise<Result<{ id: string }>> {
  if (!(await requireAdmin())) return { ok: false, error: 'err_unauthorized' };
  const clean = name.trim();
  if (!clean) return { ok: false, error: 'err_name_required' };
  try {
    const svc = createServiceClient();
    await ensureRoutePlannerPlans(svc);
    const { data, error } = await svc
      .from('erp_companies')
      .insert({ name: clean, currency: 'SAR', is_active: true, plan_key: ROUTE_PLANNER_PLAN_TRIAL, trial_ends_at: isoIn(ROUTE_PLANNER_TRIAL_DAYS) })
      .select('id')
      .single();
    if (error || !data) {
      // Surface the real cause in server logs so failures are diagnosable.
      console.error('[planner-admin] createRoutePlannerTenant failed:', error?.message, error?.details, error?.hint);
      return { ok: false, error: 'err_create' };
    }
    revalidatePath('/planner-admin');
    return { ok: true, data: { id: data.id } };
  } catch (e) {
    console.error('[planner-admin] createRoutePlannerTenant threw:', e instanceof Error ? e.message : e);
    return { ok: false, error: 'err_create' };
  }
}

async function patchTenant(companyId: string, patch: Record<string, unknown>): Promise<Result> {
  if (!(await requireAdmin())) return { ok: false, error: 'err_unauthorized' };
  const svc = await loadScopedCompany(companyId);
  if (!svc) return { ok: false, error: 'err_not_route_planner_tenant' };
  const { error } = await svc.from('erp_companies').update(patch).eq('id', companyId);
  if (error) return { ok: false, error: 'err_update' };
  revalidatePath('/planner-admin');
  return { ok: true };
}

/** Extend the free trial by N days from now (default 30). */
export async function extendTrial(companyId: string, days = ROUTE_PLANNER_TRIAL_DAYS): Promise<Result> {
  return patchTenant(companyId, { plan_key: ROUTE_PLANNER_PLAN_TRIAL, is_active: true, trial_ends_at: isoIn(days), subscription_end: null });
}

/** Convert to a paid subscription (monthly / annual) running from now. */
export async function activateSubscription(companyId: string, plan: 'monthly' | 'annual' = 'monthly'): Promise<Result> {
  const days = plan === 'annual' ? 365 : 30;
  const planKey = plan === 'annual' ? ROUTE_PLANNER_PLAN_ANNUAL : ROUTE_PLANNER_PLAN_MONTHLY;
  return patchTenant(companyId, { plan_key: planKey, is_active: true, subscription_start: new Date().toISOString(), subscription_end: isoIn(days) });
}

/** Renew an active/expired subscription by extending the end date from now. */
export async function renewSubscription(companyId: string, days = 30): Promise<Result> {
  return patchTenant(companyId, { is_active: true, subscription_end: isoIn(days) });
}

/** Suspend (or reactivate) a tenant. */
export async function setTenantSuspended(companyId: string, suspended: boolean): Promise<Result> {
  return patchTenant(companyId, { is_active: !suspended });
}

/**
 * Reset a demo tenant: clear any uploaded customer data and restore a fresh 30-day
 * trial. Strictly scoped to Route Planner tenants. Customer deletion is best-effort —
 * the planner is session-only, so a fresh tenant usually has none.
 */
export async function resetDemoData(companyId: string): Promise<Result> {
  if (!(await requireAdmin())) return { ok: false, error: 'err_unauthorized' };
  const svc = await loadScopedCompany(companyId);
  if (!svc) return { ok: false, error: 'err_not_route_planner_tenant' };
  try {
    await svc.from('erp_customers').delete().eq('company_id', companyId);
  } catch {
    // ignore — nothing to clear / table not applicable
  }
  const { error } = await svc.from('erp_companies').update({ plan_key: ROUTE_PLANNER_PLAN_TRIAL, is_active: true, trial_ends_at: isoIn(ROUTE_PLANNER_TRIAL_DAYS), subscription_start: null, subscription_end: null }).eq('id', companyId);
  if (error) return { ok: false, error: 'err_reset' };
  revalidatePath('/planner-admin');
  return { ok: true };
}
