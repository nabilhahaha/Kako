// ============================================================================
// E-Invoicing Compliance — country-agnostic document lifecycle state machine
// (Phase 5F). Pure (no DB). Generalizes the Phase-5 tax submission state machine
// so EVERY authority regime (ZATCA clearance/reporting, ETA, FTA, …) shares one
// lifecycle. Authority-touching states (submitting → cleared/reported/rejected)
// are modelled here but only DRIVEN once the paused connectors are activated.
// ============================================================================

/** Country-agnostic compliance lifecycle states. */
export type ComplianceStatus =
  | 'draft'         // invoice exists; no compliance artifacts yet
  | 'generated'     // canonical document + UUID + hash built (offline)
  | 'signed'        // signed XML attached (offline structure; real signing paused)
  | 'queued'        // enqueued for authority submission
  | 'submitting'    // in flight to authority (PAUSED until connectors activate)
  | 'cleared'       // authority cleared the document (e.g. ZATCA clearance)
  | 'reported'      // authority accepted a reported document (e.g. ZATCA reporting / ETA)
  | 'rejected'      // authority rejected (terminal unless re-generated)
  | 'failed'        // transient failure — eligible for retry
  | 'dead_lettered' // retries exhausted — needs manual intervention
  | 'cancelled';    // invoice cancelled / superseded by a note

/** Terminal states — no outgoing transitions (except explicit re-generation). */
export const TERMINAL_STATUSES: readonly ComplianceStatus[] = ['cleared', 'reported', 'cancelled'];

/** Allowed forward transitions. Country packs may restrict further, never widen. */
const TRANSITIONS: Record<ComplianceStatus, readonly ComplianceStatus[]> = {
  draft: ['generated', 'cancelled'],
  generated: ['signed', 'queued', 'cancelled'],
  signed: ['queued', 'cancelled'],
  queued: ['submitting', 'cancelled'],
  submitting: ['cleared', 'reported', 'rejected', 'failed'],
  cleared: ['cancelled'],
  reported: ['cancelled'],
  rejected: ['generated', 'cancelled'], // re-generate after fixing
  failed: ['queued', 'submitting', 'dead_lettered', 'cancelled'],
  dead_lettered: ['queued', 'cancelled'], // manual requeue
  cancelled: [],
};

/** True when `to` is a permitted next state from `from`. Pure. */
export function canTransition(from: ComplianceStatus, to: ComplianceStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** True when the state has no normal outgoing transitions. */
export function isTerminal(status: ComplianceStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export class ComplianceTransitionError extends Error {
  constructor(public readonly from: ComplianceStatus, public readonly to: ComplianceStatus) {
    super(`illegal compliance transition: ${from} → ${to}`);
    this.name = 'ComplianceTransitionError';
  }
}

/** Validate + return the next state, or throw. Pure. */
export function transition(from: ComplianceStatus, to: ComplianceStatus): ComplianceStatus {
  if (!canTransition(from, to)) throw new ComplianceTransitionError(from, to);
  return to;
}
