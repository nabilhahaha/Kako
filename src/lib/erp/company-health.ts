import type { SubscriptionState } from './subscription';

/**
 * Company Health Score (0–100) — a pure, side-effect-free scoring helper used by
 * the Company 360 workspace. All inputs are optional and degrade gracefully:
 * when a signal's backing data is absent we award a neutral/default allocation
 * (documented per dimension) rather than a misleading zero.
 *
 * ── Formula (clamped to 0–100) ───────────────────────────────────────────────
 *   subscription   (max 30): active=30, trial=22, expiring(≤7d)=18, open=15,
 *                            expired=5, suspended=0.
 *   activeUsers    (max 20): 20 * min(1, activeUsers / max(1, totalUsers)).
 *   integrations   (max 15): no integration data → 12 (neutral);
 *                            else failed sync runs present → 5;
 *                            else (≥0 connections, no failures) → 15.
 *   approvals      (max 15): 0 pending → 15; "many" (≥ MANY) pending → 5;
 *                            else (some pending) → 8.
 *   recentActivity (max 20): last activity ≤7d → 20; ≤30d → 12; else/never → 4.
 *
 * Band: score ≥ 70 → healthy; ≥ 40 → at_risk; else critical.
 */

export type HealthBand = 'healthy' | 'at_risk' | 'critical';

export interface HealthBreakdownItem {
  /** i18n key suffix under platform.company.health.dim.* */
  key: string;
  points: number;
  max: number;
}

export interface CompanyHealthResult {
  score: number;
  band: HealthBand;
  breakdown: HealthBreakdownItem[];
}

export interface CompanyHealthInput {
  /** Subscription state from subscriptionState(); drives the largest dimension. */
  subscriptionState: SubscriptionState;
  /** True when an expiring subscription is within 7 days (tighter than ≤14d). */
  expiringWithin7Days?: boolean;
  /** Distinct users with at least one branch assignment. */
  activeUsers: number;
  /** Total users associated with the company (denominator; min 1 applied). */
  totalUsers: number;
  /** Active integration connections (null/undefined = no integration data). */
  integrationConnections?: number | null;
  /** Failed sync runs in the recent window (null/undefined = no data). */
  failedSyncRuns?: number | null;
  /** Pending approval tasks (null/undefined = no data → treated as 0 pending). */
  pendingApprovals?: number | null;
  /** Days since the most recent audit event (null = never / no activity data). */
  daysSinceLastActivity?: number | null;
}

const SUBSCRIPTION_POINTS: Record<SubscriptionState, number> = {
  active: 30,
  trial: 22,
  expiring: 15, // overridden to 18 when within 7 days (see below)
  open: 15,
  expired: 5,
  suspended: 0,
};

/** ≥ this many pending approvals counts as "many" (lower score). */
const MANY_PENDING = 10;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function computeCompanyHealth(input: CompanyHealthInput): CompanyHealthResult {
  // ── Subscription (max 30) ──────────────────────────────────────────────────
  let subPoints = SUBSCRIPTION_POINTS[input.subscriptionState] ?? 15;
  if (input.subscriptionState === 'expiring') {
    subPoints = 18; // expiring (≤7d urgency) band always scores 18
  }

  // ── Active users (max 20) ──────────────────────────────────────────────────
  const denom = Math.max(1, input.totalUsers);
  const ratio = clamp(input.activeUsers / denom, 0, 1);
  const userPoints = Math.round(20 * ratio);

  // ── Integrations (max 15) ──────────────────────────────────────────────────
  let intPoints: number;
  const hasIntData =
    input.integrationConnections != null || input.failedSyncRuns != null;
  if (!hasIntData) {
    intPoints = 12; // neutral default when no integration data is available
  } else if ((input.failedSyncRuns ?? 0) > 0) {
    intPoints = 5; // recent failures
  } else {
    intPoints = 15; // ≥0 connections and no failures
  }

  // ── Approvals (max 15) ─────────────────────────────────────────────────────
  const pending = input.pendingApprovals ?? 0;
  let apprPoints: number;
  if (pending === 0) apprPoints = 15;
  else if (pending >= MANY_PENDING) apprPoints = 5;
  else apprPoints = 8;

  // ── Recent activity (max 20) ───────────────────────────────────────────────
  const days = input.daysSinceLastActivity;
  let actPoints: number;
  if (days != null && days <= 7) actPoints = 20;
  else if (days != null && days <= 30) actPoints = 12;
  else actPoints = 4; // stale or never

  const breakdown: HealthBreakdownItem[] = [
    { key: 'subscription', points: subPoints, max: 30 },
    { key: 'activeUsers', points: userPoints, max: 20 },
    { key: 'integrations', points: intPoints, max: 15 },
    { key: 'approvals', points: apprPoints, max: 15 },
    { key: 'recentActivity', points: actPoints, max: 20 },
  ];

  const score = clamp(
    breakdown.reduce((sum, b) => sum + b.points, 0),
    0,
    100,
  );

  const band: HealthBand = score >= 70 ? 'healthy' : score >= 40 ? 'at_risk' : 'critical';

  return { score, band, breakdown };
}
