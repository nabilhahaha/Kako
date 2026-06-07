// ============================================================================
// Workflow Platform V1.1 hardening flags (Constitution Art. 32). All DEFAULT OFF
// — when unset the platform behaves exactly as V1. Env-based, mirroring the
// existing KAKO_* flag convention. These gate ONLY reliability hardening
// (C1/C2/C3); they add no business behavior and no new engine.
// ============================================================================

const on = (v: string | undefined): boolean => v === '1' || v === 'true';

/** C2 — single-flight claiming of due runs (FOR UPDATE SKIP LOCKED + lease). */
export const WF_CLAIM_DUE_RUNS = (): boolean => on(process.env.KAKO_WF_CLAIM);

/** C3 — effect-idempotency ledger around side-effecting steps. */
export const WF_EFFECT_IDEMPOTENCY = (): boolean => on(process.env.KAKO_WF_IDEMPOTENT);

/** C1 — at-least-once dispatch sweep of undispatched events on the tick. */
export const WF_DISPATCH_SWEEP = (): boolean => on(process.env.KAKO_WF_DISPATCH_SWEEP);

/** Lease seconds for a claimed run before it may be reclaimed (crash recovery). */
export const WF_CLAIM_LEASE_SECONDS = (): number => {
  const n = Number(process.env.KAKO_WF_CLAIM_LEASE_SECONDS);
  return Number.isFinite(n) && n > 0 ? n : 300; // default 5 min
};
