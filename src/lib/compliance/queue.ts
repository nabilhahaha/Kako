// ============================================================================
// E-Invoicing Compliance — submission queue + retry/dead-letter model (Phase 5F).
// Pure (no DB, no clock side-effects: `now` is injected). Country-agnostic
// scheduling for authority submissions: exponential backoff with a cap, a max
// attempt budget, and a dead-letter transition when the budget is exhausted.
// The DB columns (attempts/max_attempts/next_attempt_at/dead_lettered_at) on
// erp_tax_submissions persist this; the actual authority SEND remains PAUSED.
// ============================================================================

export interface RetryPolicy {
  /** Max submission attempts before dead-lettering. */
  maxAttempts: number;
  /** First backoff delay (ms). */
  baseDelayMs: number;
  /** Exponential growth factor per attempt. */
  factor: number;
  /** Upper bound on a single backoff delay (ms). */
  maxDelayMs: number;
}

/** Default policy: 6 attempts, 1m → 2m → 4m … capped at 1h. */
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 6,
  baseDelayMs: 60_000,
  factor: 2,
  maxDelayMs: 3_600_000,
};

/** Backoff delay (ms) before attempt N (1-based). Capped at `maxDelayMs`. Pure. */
export function backoffDelayMs(attempt: number, policy: RetryPolicy = DEFAULT_RETRY_POLICY): number {
  const n = Math.max(1, Math.floor(attempt));
  const raw = policy.baseDelayMs * Math.pow(policy.factor, n - 1);
  return Math.min(raw, policy.maxDelayMs);
}

export type QueueAction = 'retry' | 'dead_letter';

export interface RetryPlan {
  action: QueueAction;
  /** Attempt counter after this failure. */
  attempts: number;
  /** When the next attempt becomes eligible (only for `retry`). */
  nextAttemptAt: Date | null;
}

/**
 * Plan the next step after a failed attempt. `attemptsSoFar` is the count BEFORE
 * this failure. Returns `dead_letter` once the budget is exhausted, else `retry`
 * with the scheduled `nextAttemptAt`. Pure (clock injected via `now`).
 */
export function planRetry(
  attemptsSoFar: number,
  now: Date,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
): RetryPlan {
  const attempts = Math.max(0, Math.floor(attemptsSoFar)) + 1;
  if (attempts >= policy.maxAttempts) {
    return { action: 'dead_letter', attempts, nextAttemptAt: null };
  }
  const nextAttemptAt = new Date(now.getTime() + backoffDelayMs(attempts + 1, policy));
  return { action: 'retry', attempts, nextAttemptAt };
}

/** True when an item is due for a retry attempt at `now`. Pure. */
export function isDue(nextAttemptAt: Date | null | undefined, now: Date): boolean {
  if (!nextAttemptAt) return true;
  return nextAttemptAt.getTime() <= now.getTime();
}

// ── Failure classification ────────────────────────────────────────────────
/** How a submission failure is categorised — drives retry vs hold decisions. */
export type FailureClass = 'transient' | 'rate_limit' | 'auth' | 'validation' | 'permanent';

export interface FailureSignal {
  httpStatus?: number;
  code?: string;          // provider/authority error code
  message?: string;
  /** Set when the failure is a network/timeout/connection error. */
  network?: boolean;
}

/**
 * Classify a failure into a retry policy class. Pure + conservative: unknown →
 * 'permanent' (held for manual review rather than retried blindly).
 */
export function classifyFailure(sig: FailureSignal): FailureClass {
  if (sig.network) return 'transient';
  const s = sig.httpStatus;
  if (s === 429) return 'rate_limit';
  if (s === 401 || s === 403) return 'auth';
  if (s === 400 || s === 409 || s === 422) return 'validation';
  if (s !== undefined && s >= 500) return 'transient';
  const code = (sig.code ?? '').toLowerCase();
  if (/timeout|temporar|unavailable|throttl/.test(code)) return 'transient';
  if (/auth|cert|credential|token/.test(code)) return 'auth';
  if (/valid|schema|business|format/.test(code)) return 'validation';
  return 'permanent';
}

/** Only transient + rate-limited failures are auto-retried. Pure. */
export function isRetryable(cls: FailureClass): boolean {
  return cls === 'transient' || cls === 'rate_limit';
}

/**
 * Plan the step after a classified failure: auto-retry/dead-letter for retryable
 * classes, else hold (no auto-retry; needs the fix-and-resubmit path). Pure.
 */
export function planFailure(
  cls: FailureClass,
  attemptsSoFar: number,
  now: Date,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
): RetryPlan & { class: FailureClass; held: boolean } {
  if (!isRetryable(cls)) {
    return { action: 'dead_letter', attempts: attemptsSoFar + 1, nextAttemptAt: null, class: cls, held: true };
  }
  return { ...planRetry(attemptsSoFar, now, policy), class: cls, held: false };
}

export interface ResubmissionPlan {
  attempts: number;
  nextAttemptAt: Date;
  deadLetteredAt: null;
}

/**
 * Manual resubmission: reset a rejected/failed/dead-lettered item back into the
 * queue (fresh attempt budget, due now, dead-letter cleared). Pure.
 */
export function planResubmission(now: Date): ResubmissionPlan {
  return { attempts: 0, nextAttemptAt: now, deadLetteredAt: null };
}
