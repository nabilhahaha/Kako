// ============================================================================
// Global Tax — e-invoice submission state machine (Phase 5B). Pure, no DB. Enforces
// the legal lifecycle every country pack drives a document through, with retry
// handling. Country-agnostic: ETA/ZATCA/FTA packs (5C+) advance a submission only
// via these transitions, so the lifecycle is consistent + auditable.
//
//   draft → generated → signed → submitted → cleared | reported   (success)
//                                          → rejected              (retryable)
//   (any non-terminal) → cancelled
// ============================================================================

export type SubmissionStatus =
  | 'draft' | 'generated' | 'signed' | 'submitted'
  | 'cleared' | 'reported' | 'rejected' | 'cancelled';

const ALLOWED: Record<SubmissionStatus, readonly SubmissionStatus[]> = {
  draft: ['generated', 'cancelled'],
  generated: ['signed', 'cancelled'],
  signed: ['submitted', 'cancelled'],
  submitted: ['cleared', 'reported', 'rejected'],
  rejected: ['generated', 'cancelled'], // re-generate + retry, or give up
  cleared: [],
  reported: [],
  cancelled: [],
};

export const TERMINAL: readonly SubmissionStatus[] = ['cleared', 'reported', 'cancelled'];

export const DEFAULT_MAX_ATTEMPTS = 6;

/** Is the status terminal (no further transitions / no retry)? */
export function isTerminal(status: SubmissionStatus): boolean {
  return TERMINAL.includes(status);
}

/** May a submission move from → to? */
export function canTransition(from: SubmissionStatus, to: SubmissionStatus): boolean {
  return ALLOWED[from].includes(to);
}

export class InvalidTransitionError extends Error {
  constructor(public from: SubmissionStatus, public to: SubmissionStatus) {
    super(`invalid submission transition ${from} → ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

/** Validate + return the next status, or throw on an illegal transition. */
export function transition(from: SubmissionStatus, to: SubmissionStatus): SubmissionStatus {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
  return to;
}

export interface RetryDecision {
  retry: boolean;
  nextStatus: SubmissionStatus;   // 'generated' to retry, else 'cancelled'
  attempts: number;
}

/** Decide what to do with a rejected submission given the attempts so far.
 *  Retries (→ regenerate) until maxAttempts, then gives up (→ cancelled). */
export function onRejected(attempts: number, maxAttempts = DEFAULT_MAX_ATTEMPTS): RetryDecision {
  const next = attempts + 1;
  return next < maxAttempts
    ? { retry: true, nextStatus: 'generated', attempts: next }
    : { retry: false, nextStatus: 'cancelled', attempts: next };
}
