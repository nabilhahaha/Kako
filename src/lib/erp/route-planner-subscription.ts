/**
 * Route Planner — Trial & Subscription model.
 *
 * A small, self-contained, future-ready model that turns a tenant's raw subscription
 * fields (already present on the `erp_companies` row — `trial_ends_at`,
 * `subscription_start/end`, `plan_key`, `is_active`) into a serializable view the UI
 * can render: status, days remaining, the warning level, and which capabilities are
 * still allowed once a trial/subscription lapses.
 *
 * Designed so monthly / annual / online-payment plans can be added later WITHOUT
 * touching the planner UI or the gating logic — only `RoutePlannerPlan` and
 * `resolveSubscription` grow. Everything downstream consumes `RoutePlannerSubscriptionView`.
 */

export type RoutePlannerStatus = 'trial' | 'active' | 'expired' | 'suspended';

/** Future-ready: today only `trial`, but `monthly` / `annual` slot in with no redesign. */
export type RoutePlannerPlan = 'trial' | 'monthly' | 'annual';

/** Default free-trial length for a brand-new Route Planner company. */
export const ROUTE_PLANNER_TRIAL_DAYS = 30;

/**
 * Warning ramp as the trial winds down (the banner picks colour/strength from this).
 *  - ok      → plenty of time
 *  - notice  → ≤ 7 days
 *  - warn    → ≤ 3 days
 *  - renew   → ≤ 1 day (renewal required)
 *  - expired → past the end date
 *  - suspended
 */
export type RoutePlannerWarning = 'ok' | 'notice' | 'warn' | 'renew' | 'expired' | 'suspended';

/** The capabilities a lapsed trial loses — read-only viewing always stays allowed. */
export interface RoutePlannerCapabilities {
  canUpload: boolean;
  canRunSplit: boolean;
  canApprove: boolean;
  canExport: boolean;
}

/** Raw subscription facts for a tenant (the slice of the company row we care about). */
export interface RoutePlannerSubscriptionInput {
  companyName: string;
  tenantId: string;
  isActive: boolean;
  planKey: string | null;
  trialEndsAt: string | null;
  subscriptionStart: string | null;
  subscriptionEnd: string | null;
  /** Anchor for trial-start display when no explicit start exists (e.g. company created_at). */
  createdAt: string | null;
}

/** The serializable view passed from server → client components. */
export interface RoutePlannerSubscriptionView {
  status: RoutePlannerStatus;
  plan: RoutePlannerPlan;
  warning: RoutePlannerWarning;
  /** Whole days left until the active trial/subscription ends (0 once lapsed). */
  daysRemaining: number;
  trialStart: string | null;
  trialEnd: string | null;
  /** Convenience: is the product fully usable right now? */
  isActive: boolean;
  capabilities: RoutePlannerCapabilities;
  companyName: string;
  tenantId: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function planFromKey(planKey: string | null): RoutePlannerPlan {
  if (planKey === 'monthly' || planKey === 'annual') return planKey;
  return 'trial';
}

function daysBetween(now: number, endIso: string | null): number {
  if (!endIso) return 0;
  const end = Date.parse(endIso);
  if (Number.isNaN(end)) return 0;
  return Math.ceil((end - now) / DAY_MS);
}

const FULL_ACCESS: RoutePlannerCapabilities = { canUpload: true, canRunSplit: true, canApprove: true, canExport: true };
const VIEW_ONLY: RoutePlannerCapabilities = { canUpload: false, canRunSplit: false, canApprove: false, canExport: false };

/**
 * Pure resolver: raw facts → view. `now` is injectable for tests / SSR determinism.
 * Status precedence: suspended (is_active=false) → active subscription → live trial → expired.
 */
export function resolveSubscription(
  input: RoutePlannerSubscriptionInput,
  now: number = Date.now(),
): RoutePlannerSubscriptionView {
  const plan = planFromKey(input.planKey);
  const base = { plan, companyName: input.companyName, tenantId: input.tenantId };

  // Hard suspension wins over everything.
  if (!input.isActive) {
    return { ...base, status: 'suspended', warning: 'suspended', daysRemaining: 0, trialStart: input.subscriptionStart, trialEnd: input.subscriptionEnd ?? input.trialEndsAt, isActive: false, capabilities: VIEW_ONLY };
  }

  // A paid subscription that has not lapsed.
  const subDays = daysBetween(now, input.subscriptionEnd);
  if (input.subscriptionEnd && subDays > 0) {
    return { ...base, status: 'active', warning: warningFor(subDays), daysRemaining: subDays, trialStart: input.subscriptionStart, trialEnd: input.subscriptionEnd, isActive: true, capabilities: FULL_ACCESS };
  }

  // Free trial.
  const trialDays = daysBetween(now, input.trialEndsAt);
  if (input.trialEndsAt && trialDays > 0) {
    return { ...base, status: 'trial', warning: warningFor(trialDays), daysRemaining: trialDays, trialStart: input.createdAt, trialEnd: input.trialEndsAt, isActive: true, capabilities: FULL_ACCESS };
  }

  // Trial or subscription has lapsed: read-only.
  return { ...base, status: 'expired', warning: 'expired', daysRemaining: 0, trialStart: input.createdAt, trialEnd: input.trialEndsAt ?? input.subscriptionEnd, isActive: false, capabilities: VIEW_ONLY };
}

function warningFor(daysRemaining: number): RoutePlannerWarning {
  if (daysRemaining <= 1) return 'renew';
  if (daysRemaining <= 3) return 'warn';
  if (daysRemaining <= 7) return 'notice';
  return 'ok';
}

/** A fresh 30-day trial starting now — used for brand-new companies / the demo fallback. */
export function freshTrial(companyName: string, tenantId: string, now: number = Date.now()): RoutePlannerSubscriptionInput {
  return {
    companyName,
    tenantId,
    isActive: true,
    planKey: 'trial',
    trialEndsAt: new Date(now + ROUTE_PLANNER_TRIAL_DAYS * DAY_MS).toISOString(),
    subscriptionStart: null,
    subscriptionEnd: null,
    createdAt: new Date(now).toISOString(),
  };
}

/**
 * Build the subscription input for a request. Reads the tenant company's own
 * subscription fields when present; for the chrome-free Demo account (no company) it
 * falls back to a fresh 30-day trial. Two optional env overrides let a seller stage any
 * state in a live demo without a database:
 *   ROUTE_PLANNER_DEMO_TRIAL_END   — ISO date to force the trial end (show warnings/expiry)
 *   ROUTE_PLANNER_DEMO_SUSPENDED   — "1" to force the suspended state
 */
export function subscriptionInputFor(
  company: { name: string; id: string; is_active: boolean; plan_key: string | null; trial_ends_at: string | null; subscription_start: string | null; subscription_end: string | null; created_at: string } | null,
  opts: { isDemo: boolean },
  now: number = Date.now(),
): RoutePlannerSubscriptionInput {
  if (company) {
    return {
      companyName: company.name,
      tenantId: company.id,
      isActive: company.is_active,
      planKey: company.plan_key,
      trialEndsAt: company.trial_ends_at,
      subscriptionStart: company.subscription_start,
      subscriptionEnd: company.subscription_end,
      createdAt: company.created_at,
    };
  }
  // Demo / no-tenant fallback.
  const demoEnd = process.env.ROUTE_PLANNER_DEMO_TRIAL_END || null;
  const suspended = process.env.ROUTE_PLANNER_DEMO_SUSPENDED === '1';
  if (opts.isDemo) {
    return {
      companyName: 'VANTORA Route Planner Demo',
      tenantId: 'demo',
      isActive: !suspended,
      planKey: 'trial',
      trialEndsAt: demoEnd ?? new Date(now + ROUTE_PLANNER_TRIAL_DAYS * DAY_MS).toISOString(),
      subscriptionStart: null,
      subscriptionEnd: null,
      createdAt: new Date(now).toISOString(),
    };
  }
  return freshTrial('VANTORA Route Planner', 'standalone', now);
}

/** Configurable WhatsApp number for renewals (digits only, intl format, no +). */
export function renewWhatsAppNumber(): string {
  return (process.env.NEXT_PUBLIC_ROUTE_PLANNER_WHATSAPP || '966500000000').replace(/[^\d]/g, '');
}

/** Build the wa.me deep-link with a pre-filled renewal message (company + tenant). */
export function buildRenewWhatsAppUrl(companyName: string, tenantId: string): string {
  const msg = `Hello,\n\nI would like to renew my VANTORA Route Planner subscription.\n\nCompany:\n${companyName || '-'}\n\nTenant:\n${tenantId || '-'}`;
  return `https://wa.me/${renewWhatsAppNumber()}?text=${encodeURIComponent(msg)}`;
}
