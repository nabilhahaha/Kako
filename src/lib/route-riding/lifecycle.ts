// ============================================================================
// Route Riding — lifecycle + acknowledgement workflow (Phase 3 FMCG). Pure.
// Models the full module flow: plan → execute → evaluate/complete → salesman
// acknowledgement → close, with follow-up + cancellation. Area/Regional manager
// review are additive overlays (timestamps on the row), not separate states.
// Workflow: Supervisor → Salesman Review → Acknowledgement → Follow-up.
// ============================================================================

import type { RideStatus } from './types';

const TRANSITIONS: Record<RideStatus, readonly RideStatus[]> = {
  planned: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: ['pending_acknowledgement', 'cancelled'],
  pending_acknowledgement: ['acknowledged', 'cancelled'],
  acknowledged: ['closed'],
  closed: [],
  cancelled: [],
};

export const RIDE_TERMINAL: readonly RideStatus[] = ['closed', 'cancelled'];

/** True when `to` follows `from`. Pure. */
export function canTransition(from: RideStatus, to: RideStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function isTerminal(status: RideStatus): boolean {
  return RIDE_TERMINAL.includes(status);
}

export class RideTransitionError extends Error {
  constructor(public readonly from: RideStatus, public readonly to: RideStatus) {
    super(`illegal route-ride transition: ${from} → ${to}`);
    this.name = 'RideTransitionError';
  }
}

/** Validate + return the next state, or throw. Pure. */
export function transition(from: RideStatus, to: RideStatus): RideStatus {
  if (!canTransition(from, to)) throw new RideTransitionError(from, to);
  return to;
}
