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
import { PLANNER_FEATURE_KEYS } from './planner-features';

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

export interface AdminDiagnostics {
  email: string | null;
  isRoutePlannerAdmin: boolean;
  isRoutePlannerExperience: boolean;
  memberships: number;
  companyId: string | null;
  serviceKeyPresent: boolean;
  serviceKeyLength: number;
  /** 'jwt' (eyJ…) | 'sb_secret' (sb_secret_…) | 'other' (wrong/truncated) | 'empty'. */
  serviceKeyShape: 'jwt' | 'sb_secret' | 'other' | 'empty';
  /** Heuristic: does the value look like a real service-role key (right shape + length)? */
  serviceKeyLooksValid: boolean;
  /** Project ref decoded from the service key's JWT payload (NOT the secret) — for legacy keys. */
  serviceKeyRef: string | null;
  supabaseUrl: string;
  /** Project ref taken from NEXT_PUBLIC_SUPABASE_URL (public). */
  supabaseRef: string | null;
  /** Does the key's project match the URL's project? null when undecidable (new-format key). */
  keyMatchesUrl: boolean | null;
  vercelEnv: string | null;
  gitRef: string | null;
  /** Short commit SHA of THIS deployment — so you can confirm you're reading the latest build. */
  commitSha: string | null;
}

/**
 * SAFE runtime diagnostic for the Route Planner Admin — confirms whether the service-role
 * key is actually present in THIS deployment's environment, which Supabase project the app
 * + the key point at, and the Vercel environment name. Never returns the secret (only its
 * presence/length, and the public project ref decoded from the JWT payload).
 */
export async function routePlannerAdminDiagnostics(): Promise<Result<AdminDiagnostics>> {
  const ctx = await getUserContext();
  if (!ctx?.isRoutePlannerAdmin) return { ok: false, error: 'err_unauthorized' };
  // Hidden by default in production — it exposes env/service-role/project details that must
  // never reach a customer UI. Only shown outside production, OR when an explicit
  // developer flag (ROUTE_PLANNER_ADMIN_DEBUG=1) is set on the server.
  const debugAllowed = process.env.VERCEL_ENV !== 'production' || process.env.ROUTE_PLANNER_ADMIN_DEBUG === '1';
  if (!debugAllowed) return { ok: false, error: 'diag_disabled' };
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://rsjvgehvastmawzwnqcs.supabase.co';
  const supabaseRef = url.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/i)?.[1] ?? null;

  // Legacy Supabase service keys are JWTs; the middle segment (base64url) carries a public
  // `ref` claim = the project ref. Decoding it exposes NO secret (the signature is dropped).
  let serviceKeyRef: string | null = null;
  const parts = key.split('.');
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { ref?: string };
      serviceKeyRef = payload.ref ?? null;
    } catch { /* not a JWT / undecodable */ }
  }
  const keyMatchesUrl = serviceKeyRef && supabaseRef ? serviceKeyRef === supabaseRef : null;

  const serviceKeyShape: AdminDiagnostics['serviceKeyShape'] =
    key.length === 0 ? 'empty' : key.startsWith('sb_secret') ? 'sb_secret' : parts.length === 3 ? 'jwt' : 'other';
  // A real service-role key is a long JWT (decodable ref) or an sb_secret_ token.
  const serviceKeyLooksValid =
    serviceKeyShape === 'jwt' ? serviceKeyRef !== null && key.length > 100 :
    serviceKeyShape === 'sb_secret' ? key.length >= 40 : false;

  return {
    ok: true,
    data: {
      email: ctx.profile?.email ?? null,
      isRoutePlannerAdmin: ctx.isRoutePlannerAdmin,
      isRoutePlannerExperience: ctx.isRoutePlannerExperience,
      memberships: ctx.memberships.length,
      companyId: ctx.companyId,
      serviceKeyPresent: key.length > 0,
      serviceKeyLength: key.length,
      serviceKeyShape,
      serviceKeyLooksValid,
      serviceKeyRef,
      supabaseUrl: url,
      supabaseRef,
      keyMatchesUrl,
      vercelEnv: process.env.VERCEL_ENV ?? null,
      gitRef: process.env.VERCEL_GIT_COMMIT_REF ?? null,
      commitSha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    },
  };
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

/** Construct the service-role client, or return a precise reason it is unavailable. */
function serviceClientOrError(): { svc: ReturnType<typeof createServiceClient> } | { err: string } {
  try {
    return { svc: createServiceClient() };
  } catch (e) {
    return { err: `service_client: ${e instanceof Error ? e.message : 'unavailable'}` };
  }
}

export interface PlatformOverview {
  totalUsers: number;
  activeMissions: number;
  datasets: number;
  failedSyncs: number;
}

/** Platform-wide Planner aggregates (service-role; across all tenants). Admin-only. */
export async function platformOverview(): Promise<Result<PlatformOverview>> {
  if (!(await requireAdmin())) return { ok: false, error: 'err_unauthorized' };
  const sc = serviceClientOrError();
  if ('err' in sc) return { ok: false, error: sc.err };
  const svc = sc.svc;
  try {
    const [users, activeMissions, datasets, failedSyncs] = await Promise.all([
      svc.from('erp_route_planner_access').select('id', { count: 'exact', head: true }),
      svc.from('erp_rp_missions').select('id', { count: 'exact', head: true }).in('status', ['assigned', 'in_progress']),
      svc.from('erp_rp_datasets').select('id', { count: 'exact', head: true }),
      svc.from('erp_rp_sync_runs').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
    ]);
    return { ok: true, data: { totalUsers: users.count ?? 0, activeMissions: activeMissions.count ?? 0, datasets: datasets.count ?? 0, failedSyncs: failedSyncs.count ?? 0 } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'overview_failed' };
  }
}

export async function listRoutePlannerTenants(): Promise<Result<PlannerTenantRow[]>> {
  if (!(await requireAdmin())) return { ok: false, error: 'err_unauthorized' };
  const sc = serviceClientOrError();
  if ('err' in sc) { console.error('[planner-admin] list:', sc.err); return { ok: false, error: sc.err }; }
  const svc = sc.svc;
  try {
    const { data, error } = await svc
      .from('erp_companies')
      .select('id, name, plan_key, is_active, trial_ends_at, subscription_start, subscription_end, created_at, updated_at')
      .like('plan_key', `${ROUTE_PLANNER_PLAN_PREFIX}%`)
      .order('created_at', { ascending: false });
    if (error) { console.error('[planner-admin] list query:', error.message); return { ok: false, error: `query: ${error.message}` }; }
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
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[planner-admin] list threw:', msg);
    return { ok: false, error: `query: ${msg}` };
  }
}

/**
 * Ensure the Route Planner plan keys exist in erp_plans. `erp_companies.plan_key` is a
 * FK to erp_plans(key), so a company can only carry a `route_planner_*` plan once these
 * rows exist (migration 0352 seeds them; this is a self-healing belt-and-suspenders).
 */
async function ensureRoutePlannerPlans(svc: ReturnType<typeof createServiceClient>): Promise<string | null> {
  const { error } = await svc.from('erp_plans').upsert([
    { key: ROUTE_PLANNER_PLAN_TRIAL, name_ar: 'مخطط الخطوط — تجربة', rank: 0 },
    { key: ROUTE_PLANNER_PLAN_MONTHLY, name_ar: 'مخطط الخطوط — شهري', rank: 0 },
    { key: ROUTE_PLANNER_PLAN_ANNUAL, name_ar: 'مخطط الخطوط — سنوي', rank: 0 },
  ], { onConflict: 'key', ignoreDuplicates: true });
  return error ? error.message : null;
}

export async function createRoutePlannerTenant(name: string): Promise<Result<{ id: string }>> {
  if (!(await requireAdmin())) return { ok: false, error: 'err_unauthorized' };
  const clean = name.trim();
  if (!clean) return { ok: false, error: 'err_name_required' };
  const sc = serviceClientOrError();
  if ('err' in sc) { console.error('[planner-admin] create:', sc.err); return { ok: false, error: sc.err }; }
  const svc = sc.svc;
  try {
    // Self-heal the FK first; if even this fails we report exactly why.
    const planErr = await ensureRoutePlannerPlans(svc);
    if (planErr) { console.error('[planner-admin] ensure plans:', planErr); return { ok: false, error: `plans: ${planErr}` }; }
    const { data, error } = await svc
      .from('erp_companies')
      .insert({ name: clean, currency: 'SAR', is_active: true, plan_key: ROUTE_PLANNER_PLAN_TRIAL, trial_ends_at: isoIn(ROUTE_PLANNER_TRIAL_DAYS) })
      .select('id')
      .single();
    if (error || !data) {
      // Surface the REAL cause to the admin UI + server logs (admin-only tool).
      const detail = error ? `${error.message}${error.hint ? ` | hint: ${error.hint}` : ''}${error.details ? ` | ${error.details}` : ''}` : 'no row returned';
      console.error('[planner-admin] createRoutePlannerTenant failed:', detail);
      return { ok: false, error: `insert: ${detail}` };
    }
    revalidatePath('/planner-admin');
    return { ok: true, data: { id: data.id } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[planner-admin] createRoutePlannerTenant threw:', msg);
    return { ok: false, error: `exception: ${msg}` };
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

/**
 * Create a login for a Route Planner company and attach it to that company. The new user
 * can sign in with the email/password and — because they belong to a `route_planner_*`
 * tenant — automatically gets ONLY that company's chrome-free Route Planner experience.
 * Strictly scoped to Route Planner tenants. Uses the service-role Admin API to create the
 * auth user (with a password); ensures the company has a default branch to attach to.
 */
export async function addRoutePlannerUser(
  companyId: string,
  input: { name: string; email: string; password: string; role: 'admin' | 'user' },
): Promise<Result<{ id: string }>> {
  if (!(await requireAdmin())) return { ok: false, error: 'err_unauthorized' };
  const svc = await loadScopedCompany(companyId);
  if (!svc) return { ok: false, error: 'err_not_route_planner_tenant' };

  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!email || !/.+@.+\..+/.test(email)) return { ok: false, error: 'err_email' };
  if (input.password.length < 6) return { ok: false, error: 'err_password' };

  try {
    // 1) Create the auth user (auto-confirmed so they can log in immediately).
    const { data: created, error: cErr } = await svc.auth.admin.createUser({
      email, password: input.password, email_confirm: true, user_metadata: { full_name: name },
    });
    if (cErr || !created?.user) {
      console.error('[planner-admin] addUser create:', cErr?.message);
      return { ok: false, error: `create_user: ${cErr?.message ?? 'failed'}` };
    }
    const uid = created.user.id;

    // 2) Mirror into erp_profiles (id = auth uid).
    await svc.from('erp_profiles').upsert({ id: uid, email, full_name: name || email, is_active: true }, { onConflict: 'id' });

    // 3) Ensure the company has a branch to attach the membership to.
    const { data: existing } = await svc.from('erp_branches').select('id').eq('company_id', companyId).order('created_at', { ascending: true }).limit(1).maybeSingle();
    let branchId = (existing as { id: string } | null)?.id ?? null;
    if (!branchId) {
      const { data: nb, error: bErr } = await svc.from('erp_branches').insert({ company_id: companyId, code: 'MAIN', name: 'Main', is_hq: true }).select('id').single();
      if (bErr || !nb) { console.error('[planner-admin] addUser branch:', bErr?.message); return { ok: false, error: `branch: ${bErr?.message ?? 'failed'}` }; }
      branchId = nb.id;
    }

    // 4) Attach the membership. Company-driven experience → any role gets the planner;
    //    'admin' = company admin, 'user' = viewer.
    const branchRole = input.role === 'admin' ? 'admin' : 'viewer';
    const { error: mErr } = await svc.from('erp_user_branches').upsert({ user_id: uid, branch_id: branchId, role: branchRole, is_default: true }, { onConflict: 'user_id,branch_id' });
    if (mErr) { console.error('[planner-admin] addUser membership:', mErr.message); return { ok: false, error: `membership: ${mErr.message}` }; }

    revalidatePath('/planner-admin');
    return { ok: true, data: { id: uid } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[planner-admin] addRoutePlannerUser threw:', msg);
    return { ok: false, error: `exception: ${msg}` };
  }
}

// ── Platform Owner: Company 360 + per-company admin management ───────────────
// All service-role, requireAdmin-gated (Route Planner platform owner), and scoped to a
// single route_planner tenant via loadScopedCompany — every query filters company_id, so
// no cross-company data is ever returned or written.

export interface PlatformCompany360 {
  id: string; name: string; planKey: string | null; isActive: boolean;
  trialEndsAt: string | null; subscriptionEnd: string | null; createdAt: string | null;
  users: { total: number; active: number; admins: number; managers: number; supervisors: number; fieldUsers: number };
  datasets: { count: number; activeName: string | null };
  latestSyncAt: string | null; failedSyncs: number;
  missions: number; plans: number; requests: number;
}

export async function platformCompany360(companyId: string): Promise<Result<PlatformCompany360>> {
  if (!(await requireAdmin())) return { ok: false, error: 'err_unauthorized' };
  const svc = await loadScopedCompany(companyId);
  if (!svc) return { ok: false, error: 'err_not_route_planner_tenant' };
  try {
    const { data: company } = await svc.from('erp_companies').select('id, name, plan_key, is_active, trial_ends_at, subscription_end, created_at').eq('id', companyId).single();
    if (!company) return { ok: false, error: 'not_found' };

    const { data: members } = await svc.from('erp_user_branches').select('user_id, role, branch:erp_branches!inner(company_id)').eq('branch.company_id', companyId);
    const memberIds = [...new Set((members ?? []).map((r) => r.user_id as string))];
    const admins = new Set((members ?? []).filter((r) => r.role === 'admin').map((r) => r.user_id as string)).size;
    const [{ data: profiles }, { data: access }] = await Promise.all([
      memberIds.length ? svc.from('erp_profiles').select('id, is_active').in('id', memberIds) : Promise.resolve({ data: [] as { id: string; is_active: boolean }[] }),
      svc.from('erp_route_planner_access').select('user_id, role').eq('company_id', companyId),
    ]);
    const activeUsers = (profiles ?? []).filter((p) => (p as { is_active?: boolean }).is_active !== false).length;
    const byRole = { managers: 0, supervisors: 0, fieldUsers: 0 };
    for (const a of access ?? []) {
      const role = a.role as string;
      if (role === 'manager' || role === 'area_manager') byRole.managers++;
      else if (role === 'supervisor') byRole.supervisors++;
      else if (role === 'field_user') byRole.fieldUsers++;
    }
    const { data: datasets } = await svc.from('erp_rp_datasets').select('name, is_active').eq('company_id', companyId);
    const activeDs = (datasets ?? []).find((d) => d.is_active);
    const { data: sync } = await svc.from('erp_rp_sync_runs').select('started_at').eq('company_id', companyId).order('started_at', { ascending: false }).limit(1).maybeSingle();
    const cnt = async (tbl: string, extra?: [string, string]) => {
      let q = svc.from(tbl).select('id', { count: 'exact', head: true }).eq('company_id', companyId);
      if (extra) q = q.eq(extra[0], extra[1]);
      return (await q).count ?? 0;
    };
    const [failedSyncs, missions, dayPlans, journeyPlans, requests] = await Promise.all([
      cnt('erp_rp_sync_runs', ['status', 'failed']), cnt('erp_rp_missions'), cnt('erp_rp_day_plans'), cnt('erp_rp_journey_plans'), cnt('erp_route_planner_requests'),
    ]);
    return {
      ok: true,
      data: {
        id: company.id as string, name: company.name as string, planKey: (company.plan_key as string | null) ?? null,
        isActive: company.is_active !== false, trialEndsAt: (company.trial_ends_at as string | null) ?? null,
        subscriptionEnd: (company.subscription_end as string | null) ?? null, createdAt: (company.created_at as string | null) ?? null,
        users: { total: memberIds.length, active: activeUsers, admins, ...byRole },
        datasets: { count: (datasets ?? []).length, activeName: (activeDs?.name as string | null) ?? null },
        latestSyncAt: (sync?.started_at as string | null) ?? null, failedSyncs,
        missions, plans: dayPlans + journeyPlans, requests,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'overview_failed' };
  }
}

export interface TenantAdminRow { id: string; name: string; email: string | null; active: boolean }

/** Company admins (branch role 'admin') of a tenant — for Platform Owner management. */
export async function listCompanyAdmins(companyId: string): Promise<Result<TenantAdminRow[]>> {
  if (!(await requireAdmin())) return { ok: false, error: 'err_unauthorized' };
  const svc = await loadScopedCompany(companyId);
  if (!svc) return { ok: false, error: 'err_not_route_planner_tenant' };
  const { data: members } = await svc.from('erp_user_branches').select('user_id, role, branch:erp_branches!inner(company_id)').eq('branch.company_id', companyId).eq('role', 'admin');
  const ids = [...new Set((members ?? []).map((r) => r.user_id as string))];
  if (ids.length === 0) return { ok: true, data: [] };
  const { data: profiles } = await svc.from('erp_profiles').select('id, full_name, email, is_active').in('id', ids);
  const rows = (profiles ?? []).map((p) => ({
    id: p.id as string, name: (p.full_name as string | null) || (p.email as string | null) || String(p.id).slice(0, 8),
    email: (p.email as string | null) ?? null, active: (p as { is_active?: boolean }).is_active !== false,
  })).sort((a, b) => a.name.localeCompare(b.name));
  return { ok: true, data: rows };
}

/** Activate / deactivate a user inside a tenant (Platform Owner). Verifies the user is a
 *  member of THAT company (cross-company safe); platform-owner gated; route_planner tenant only. */
export async function setTenantUserActive(companyId: string, userId: string, active: boolean): Promise<Result> {
  if (!(await requireAdmin())) return { ok: false, error: 'err_unauthorized' };
  const svc = await loadScopedCompany(companyId);
  if (!svc) return { ok: false, error: 'err_not_route_planner_tenant' };
  const { data: member } = await svc.from('erp_user_branches').select('user_id, branch:erp_branches!inner(company_id)').eq('user_id', userId).eq('branch.company_id', companyId).limit(1).maybeSingle();
  if (!member) return { ok: false, error: 'err_not_company_member' };
  const { error } = await svc.from('erp_profiles').update({ is_active: active }).eq('id', userId);
  if (error) return { ok: false, error: error.message };
  try { await svc.rpc('erp_log_audit', { p_action: active ? 'activate' : 'deactivate', p_entity: 'planner_user', p_entity_id: userId, p_details: { active }, p_company_id: companyId }); } catch { /* audit best-effort */ }
  revalidatePath('/planner-admin');
  return { ok: true };
}

// ── Platform Owner: rich create-company + per-company feature enablement ─────
// Reuses the existing erp_companies + erp_company_modules tables (no new models).
// All actions are requireAdmin-gated (platform owner) and scoped by company_id;
// feature reads/writes go through loadScopedCompany so a non-route_planner ERP
// tenant is never touched, and never leak across companies.

const PLAN_KEY_OF: Record<'trial' | 'monthly' | 'annual', string> = {
  trial: ROUTE_PLANNER_PLAN_TRIAL,
  monthly: ROUTE_PLANNER_PLAN_MONTHLY,
  annual: ROUTE_PLANNER_PLAN_ANNUAL,
};

export interface CreateTenantInput {
  name: string;
  country?: string;
  city?: string;
  industry?: string;
  plan: 'trial' | 'monthly' | 'annual';
  /** ISO date (yyyy-mm-dd) — optional; defaults applied when omitted. */
  trialStart?: string | null;
  trialEnd?: string | null;
  pilotActive?: boolean;
  status: 'trial' | 'active' | 'suspended';
  adminName?: string;
  adminEmail?: string;
  adminPassword?: string;
  /** Feature keys (erp_company_modules.module) to enable; the rest are disabled. */
  features: string[];
}

/** Generate a readable temporary password when the owner leaves it blank. */
function genPassword(): string {
  return `Vp-${Math.random().toString(36).slice(2, 8)}${Math.floor(10 + Math.random() * 89)}`;
}

/**
 * Create a Route Planner tenant with full provisioning metadata, an optional first
 * company admin, and an explicit per-company feature set. Service-role (the owner is
 * not a member); strictly caged to route_planner plans. Returns the new id plus the
 * admin credentials when an admin was created (so the owner can hand them over).
 */
export async function createRoutePlannerTenantRich(
  input: CreateTenantInput,
): Promise<Result<{ id: string; adminEmail?: string; adminPassword?: string }>> {
  if (!(await requireAdmin())) return { ok: false, error: 'err_unauthorized' };
  const name = input.name.trim();
  if (!name) return { ok: false, error: 'err_name_required' };
  const sc = serviceClientOrError();
  if ('err' in sc) { console.error('[planner-admin] createRich:', sc.err); return { ok: false, error: sc.err }; }
  const svc = sc.svc;
  try {
    const planErr = await ensureRoutePlannerPlans(svc);
    if (planErr) return { ok: false, error: `plans: ${planErr}` };

    const planKey = PLAN_KEY_OF[input.plan] ?? ROUTE_PLANNER_PLAN_TRIAL;
    const isActive = input.status !== 'suspended';
    const today = new Date().toISOString().slice(0, 10);
    const trialDaysEnd = isoIn(ROUTE_PLANNER_TRIAL_DAYS).slice(0, 10);
    const subDays = input.plan === 'annual' ? 365 : 30;

    const row: Record<string, unknown> = {
      name, currency: 'SAR', is_active: isActive, plan_key: planKey,
      business_type: input.industry?.trim() || null,
      country: input.country?.trim() || null,
      city: input.city?.trim() || null,
      is_pilot: Boolean(input.pilotActive),
      trial_starts_at: input.trialStart || today,
      trial_ends_at: input.trialEnd || trialDaysEnd,
    };
    // A status of 'active' carries a running subscription window.
    if (input.status === 'active') {
      row.subscription_start = today;
      row.subscription_end = input.trialEnd || isoIn(subDays).slice(0, 10);
    }

    const { data, error } = await svc.from('erp_companies').insert(row).select('id').single();
    if (error || !data) {
      const detail = error ? `${error.message}${error.hint ? ` | hint: ${error.hint}` : ''}` : 'no row returned';
      console.error('[planner-admin] createRich insert:', detail);
      return { ok: false, error: `insert: ${detail}` };
    }
    const newId = data.id as string;

    // Seed the per-company feature set into the SHARED erp_company_modules store.
    const wanted = new Set(input.features);
    const moduleRows = PLANNER_FEATURE_KEYS.map((key) => ({ company_id: newId, module: key, enabled: wanted.has(key) }));
    await svc.from('erp_company_modules').upsert(moduleRows, { onConflict: 'company_id,module' });

    // Optional first company admin (reuses the same provisioning path).
    let adminEmail: string | undefined;
    let adminPassword: string | undefined;
    const email = input.adminEmail?.trim().toLowerCase();
    if (email) {
      adminPassword = (input.adminPassword && input.adminPassword.length >= 6) ? input.adminPassword : genPassword();
      const res = await addRoutePlannerUser(newId, { name: input.adminName || email, email, password: adminPassword, role: 'admin' });
      if (!res.ok) {
        // The company exists; surface the admin error but don't roll back the tenant.
        console.error('[planner-admin] createRich admin:', res.error);
        return { ok: true, data: { id: newId } };
      }
      adminEmail = email;
    }

    try {
      await svc.rpc('erp_log_audit', { p_action: 'create', p_entity: 'planner_company', p_entity_id: newId, p_details: { plan: input.plan, status: input.status, pilot: Boolean(input.pilotActive), features: input.features }, p_company_id: newId });
    } catch { /* audit best-effort */ }

    revalidatePath('/planner-admin');
    return { ok: true, data: { id: newId, adminEmail, adminPassword: adminEmail ? adminPassword : undefined } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[planner-admin] createRoutePlannerTenantRich threw:', msg);
    return { ok: false, error: `exception: ${msg}` };
  }
}

/** Per-company feature state — enabled map keyed by feature key. Absent rows default
 *  to enabled (matching the shared gate: no explicit restriction = on). */
export async function listCompanyFeatures(companyId: string): Promise<Result<Record<string, boolean>>> {
  if (!(await requireAdmin())) return { ok: false, error: 'err_unauthorized' };
  const svc = await loadScopedCompany(companyId);
  if (!svc) return { ok: false, error: 'err_not_route_planner_tenant' };
  const { data, error } = await svc.from('erp_company_modules').select('module, enabled').eq('company_id', companyId);
  if (error) return { ok: false, error: error.message };
  const explicit = new Map((data ?? []).map((r) => [r.module as string, r.enabled as boolean]));
  const out: Record<string, boolean> = {};
  for (const key of PLANNER_FEATURE_KEYS) out[key] = explicit.has(key) ? explicit.get(key)! : true;
  return { ok: true, data: out };
}

/** Enable / disable a single feature for a tenant. Platform-owner gated, route_planner
 *  scoped, company_id-bound (no cross-company write), audited. Writes the shared
 *  erp_company_modules row the ERP navigation gates on, so a disabled feature drops out
 *  of that company's menus/routes/actions on the next request. */
export async function setCompanyFeature(companyId: string, key: string, enabled: boolean): Promise<Result> {
  if (!(await requireAdmin())) return { ok: false, error: 'err_unauthorized' };
  if (!PLANNER_FEATURE_KEYS.includes(key)) return { ok: false, error: 'err_unknown_feature' };
  const svc = await loadScopedCompany(companyId);
  if (!svc) return { ok: false, error: 'err_not_route_planner_tenant' };
  const { error } = await svc.from('erp_company_modules').upsert({ company_id: companyId, module: key, enabled }, { onConflict: 'company_id,module' });
  if (error) return { ok: false, error: error.message };
  try { await svc.rpc('erp_log_audit', { p_action: enabled ? 'enable' : 'disable', p_entity: 'company_feature', p_entity_id: key, p_details: { enabled }, p_company_id: companyId }); } catch { /* best-effort */ }
  revalidatePath('/planner-admin');
  return { ok: true };
}
