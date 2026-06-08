// ============================================================================
// E-Invoicing Compliance — country-agnostic document lifecycle engine (Phase 5F,
// expanded 5G). Pure (no DB). One lifecycle every authority regime shares, with
// CONFIGURABLE per-country transition profiles layered over a global default.
// Authority-touching states (submitting → cleared/reported/accepted/rejected)
// are modelled here but only DRIVEN once the paused connectors activate.
// ============================================================================

/** Country-agnostic compliance lifecycle states (global superset). */
export type ComplianceStatus =
  | 'draft'                  // invoice exists; no compliance artifacts yet
  | 'generated'              // canonical document + UUID + hash built (offline)
  | 'signed'                 // signed XML attached (offline structure; real signing paused)
  | 'validated'             // passed pre-submission validation (schema/business rules)
  | 'queued'                 // enqueued for authority submission
  | 'submitting'             // in flight to authority (PAUSED until connectors activate)
  | 'submitted'              // delivered to authority; awaiting outcome
  | 'reported'               // authority accepted a reported document (e.g. ZATCA reporting)
  | 'cleared'                // authority cleared the document (e.g. ZATCA clearance)
  | 'accepted'               // authority accepted (e.g. ETA / PEPPOL MLS accepted)
  | 'accepted_with_warning'  // accepted with non-blocking warnings
  | 'rejected'               // authority rejected (re-generate after fixing)
  | 'failed'                 // transient failure — eligible for retry
  | 'dead_lettered'          // retries exhausted — needs manual intervention
  | 'cancelled';             // invoice cancelled / superseded by a note

/** All states, in lifecycle order (useful for UI + validation). */
export const ALL_STATUSES: readonly ComplianceStatus[] = [
  'draft', 'generated', 'signed', 'validated', 'queued', 'submitting', 'submitted',
  'reported', 'cleared', 'accepted', 'accepted_with_warning', 'rejected', 'failed',
  'dead_lettered', 'cancelled',
];

export type TransitionMap = Record<ComplianceStatus, readonly ComplianceStatus[]>;

/** Global default transitions. A country profile may restrict these, never widen. */
export const DEFAULT_TRANSITIONS: TransitionMap = {
  draft: ['generated', 'cancelled'],
  generated: ['signed', 'validated', 'queued', 'cancelled'],
  signed: ['validated', 'queued', 'cancelled'],
  validated: ['signed', 'queued', 'cancelled'],
  queued: ['submitting', 'cancelled'],
  submitting: ['submitted', 'reported', 'cleared', 'accepted', 'accepted_with_warning', 'rejected', 'failed'],
  submitted: ['reported', 'cleared', 'accepted', 'accepted_with_warning', 'rejected', 'failed'],
  reported: ['accepted', 'accepted_with_warning', 'cancelled'],
  cleared: ['cancelled'],
  accepted: ['cancelled'],
  accepted_with_warning: ['cancelled'],
  rejected: ['generated', 'cancelled'],
  failed: ['queued', 'submitting', 'dead_lettered', 'cancelled'],
  dead_lettered: ['queued', 'cancelled'],
  cancelled: [],
};

/** Default terminal states (no normal outgoing transitions). */
export const TERMINAL_STATUSES: readonly ComplianceStatus[] =
  ['cleared', 'accepted', 'accepted_with_warning', 'cancelled'];

/** A configurable per-country/regime lifecycle profile. */
export interface LifecycleProfile {
  regime: string;
  transitions: TransitionMap;
  terminal: readonly ComplianceStatus[];
}

/** The global default profile (used when a regime has no specific profile). */
export const DEFAULT_LIFECYCLE: LifecycleProfile = {
  regime: 'default',
  transitions: DEFAULT_TRANSITIONS,
  terminal: TERMINAL_STATUSES,
};

/** Build a profile from a partial override of the default transition map. */
export function defineLifecycle(
  regime: string,
  overrides: Partial<TransitionMap>,
  terminal: readonly ComplianceStatus[] = TERMINAL_STATUSES,
): LifecycleProfile {
  return { regime, transitions: { ...DEFAULT_TRANSITIONS, ...overrides }, terminal };
}

/** Registry of per-regime lifecycle profiles. */
export class LifecycleRegistry {
  private profiles = new Map<string, LifecycleProfile>();
  register(p: LifecycleProfile): void { this.profiles.set(p.regime, p); }
  get(regime: string): LifecycleProfile { return this.profiles.get(regime) ?? DEFAULT_LIFECYCLE; }
  list(): readonly LifecycleProfile[] { return [...this.profiles.values()]; }
}

/** Shared default registry. */
export const lifecycleRegistry = new LifecycleRegistry();

// Example regime profiles (clearance vs reporting end states differ).
lifecycleRegistry.register(defineLifecycle('zatca', {
  // standard (B2B) clears; simplified (B2C) reports — both supported, no warning state
  reported: ['cancelled'],
  cleared: ['cancelled'],
}, ['cleared', 'reported', 'cancelled']));
lifecycleRegistry.register(defineLifecycle('eta', {
  submitted: ['accepted', 'accepted_with_warning', 'rejected', 'failed'],
}, ['accepted', 'accepted_with_warning', 'cancelled']));

export class ComplianceTransitionError extends Error {
  constructor(public readonly from: ComplianceStatus, public readonly to: ComplianceStatus, regime = 'default') {
    super(`illegal compliance transition (${regime}): ${from} → ${to}`);
    this.name = 'ComplianceTransitionError';
  }
}

/** True when `to` is permitted from `from` under a profile (default if omitted). Pure. */
export function canTransitionFor(profile: LifecycleProfile, from: ComplianceStatus, to: ComplianceStatus): boolean {
  return profile.transitions[from]?.includes(to) ?? false;
}

/** True when `to` is permitted from `from` under the global default. Pure. */
export function canTransition(from: ComplianceStatus, to: ComplianceStatus): boolean {
  return canTransitionFor(DEFAULT_LIFECYCLE, from, to);
}

/** True when the state is terminal under a profile (default if omitted). */
export function isTerminalFor(profile: LifecycleProfile, status: ComplianceStatus): boolean {
  return profile.terminal.includes(status);
}

/** True when the state is terminal under the global default. */
export function isTerminal(status: ComplianceStatus): boolean {
  return isTerminalFor(DEFAULT_LIFECYCLE, status);
}

/** Validate + return the next state under a profile, or throw. Pure. */
export function transitionFor(profile: LifecycleProfile, from: ComplianceStatus, to: ComplianceStatus): ComplianceStatus {
  if (!canTransitionFor(profile, from, to)) throw new ComplianceTransitionError(from, to, profile.regime);
  return to;
}

/** Validate + return the next state under the global default, or throw. Pure. */
export function transition(from: ComplianceStatus, to: ComplianceStatus): ComplianceStatus {
  return transitionFor(DEFAULT_LIFECYCLE, from, to);
}
