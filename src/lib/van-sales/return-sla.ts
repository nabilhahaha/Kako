// Return Approval — SLA tracking (PURE, no I/O). From the timestamps stamped on
// a return (requested_at, first_viewed_at, approved_at | rejected_at) these
// helpers compute responsiveness metrics so supervisors/managers can spot
// approval bottlenecks: Time To Review, Time To Approve, pending-age buckets
// (> 24h / > 48h) and the average approval time across a set of decided returns.
// Capability: platform.return_approval_sla (company opt-in, permission-gated).

/** The SLA-relevant timestamps captured on a return header. */
export interface ReturnSlaTimestamps {
  requestedAt: string | Date | null;
  firstViewedAt?: string | Date | null;
  decidedAt?: string | Date | null; // approved_at OR rejected_at
}

function ms(v: string | Date | null | undefined): number | null {
  if (!v) return null;
  const t = v instanceof Date ? v.getTime() : Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

/** Minutes between two timestamps, or null when either is missing/invalid. */
export function minutesBetween(from: string | Date | null | undefined, to: string | Date | null | undefined): number | null {
  const a = ms(from); const b = ms(to);
  if (a == null || b == null) return null;
  return Math.max(0, (b - a) / 60000);
}

/** Time To Review = first view − request (minutes). Null until first viewed. */
export function timeToReviewMinutes(t: ReturnSlaTimestamps): number | null {
  return minutesBetween(t.requestedAt, t.firstViewedAt);
}

/** Time To Approve/Decide = decision − request (minutes). Null until decided. */
export function timeToApproveMinutes(t: ReturnSlaTimestamps): number | null {
  return minutesBetween(t.requestedAt, t.decidedAt);
}

/** How long a still-pending return has been waiting (hours) as of `now`. */
export function pendingAgeHours(requestedAt: string | Date | null | undefined, now: Date = new Date()): number | null {
  const m = minutesBetween(requestedAt, now);
  return m == null ? null : m / 60;
}

export type PendingBucket = 'under_24h' | 'over_24h' | 'over_48h';

/** Bucket a pending return by age: > 48h, else > 24h, else under 24h. */
export function pendingBucket(requestedAt: string | Date | null | undefined, now: Date = new Date()): PendingBucket {
  const h = pendingAgeHours(requestedAt, now) ?? 0;
  if (h >= 48) return 'over_48h';
  if (h >= 24) return 'over_24h';
  return 'under_24h';
}

/** SLA urgency tier for sorting/colour: 2 = breach (> 48h), 1 = warn (> 24h), 0 = new. */
export function slaTier(requestedAt: string | Date | null | undefined, now: Date = new Date()): 0 | 1 | 2 {
  const b = pendingBucket(requestedAt, now);
  return b === 'over_48h' ? 2 : b === 'over_24h' ? 1 : 0;
}

/**
 * Approver-queue priority comparator (who needs attention FIRST). Pure. Order:
 *   1) SLA breach tier, most-breached first (> 48h, then > 24h, then new)
 *   2) Highest return value first
 *   3) Oldest request first
 */
export function compareApprovalPriority(
  a: { requestedAt: string | Date | null | undefined; value: number },
  b: { requestedAt: string | Date | null | undefined; value: number },
  now: Date = new Date(),
): number {
  const ta = slaTier(a.requestedAt, now); const tb = slaTier(b.requestedAt, now);
  if (ta !== tb) return tb - ta; // higher tier first

  if (Number(b.value) !== Number(a.value)) return Number(b.value) - Number(a.value); // higher value first

  const am = a.requestedAt ? Date.parse(a.requestedAt as string) : Number.POSITIVE_INFINITY;
  const bm = b.requestedAt ? Date.parse(b.requestedAt as string) : Number.POSITIVE_INFINITY;
  return am - bm; // oldest first
}

export interface SlaSummary {
  count: number;            // decided returns counted
  avgApproveMinutes: number | null;
  avgReviewMinutes: number | null;
  pendingOver24h: number;
  pendingOver48h: number;
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

/**
 * Summarize SLA across a set of returns. `decided` contribute to the average
 * review/approve times; `pendingRequestedAt` are still-open requests bucketed by
 * age. Pure — pass `now` for deterministic reporting.
 */
export function summarizeSla(
  decided: ReturnSlaTimestamps[],
  pendingRequestedAt: Array<string | Date | null> = [],
  now: Date = new Date(),
): SlaSummary {
  const approveTimes = decided.map(timeToApproveMinutes).filter((n): n is number => n != null);
  const reviewTimes = decided.map(timeToReviewMinutes).filter((n): n is number => n != null);
  let over24 = 0; let over48 = 0;
  for (const r of pendingRequestedAt) {
    const b = pendingBucket(r, now);
    if (b === 'over_48h') { over48 += 1; over24 += 1; }
    else if (b === 'over_24h') { over24 += 1; }
  }
  return {
    count: decided.length,
    avgApproveMinutes: avg(approveTimes),
    avgReviewMinutes: avg(reviewTimes),
    pendingOver24h: over24,
    pendingOver48h: over48,
  };
}

/** Is the SLA-tracking capability active for this tenant? Pure. */
export function returnSlaEnabled(flags: Record<string, boolean | undefined> | null | undefined): boolean {
  return Boolean(flags?.['platform.return_approval_sla']);
}
