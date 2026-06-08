// ============================================================================
// Van Sales — salesman day state machine (Phase A). Pure, no I/O. The mobile
// spine's hard gate: no selling before the day is OPEN (van load confirmed +
// cash float entered), and no close before the day is reconciled (physical
// count done + cash/stock tie out, or variance approved) with nothing unsynced.
//
// This orchestrates over the existing primitives — it does NOT replace them:
// the work session (erp_work_sessions / repDayBlocked), van load confirmation,
// and van-accounting settlement supply the context booleans; this module decides
// the legal transitions. Server wiring lands in later Phase-A/B increments.
// ============================================================================

/** The salesman's day lifecycle. */
export type VanDayState =
  | 'not_started' // no work session today
  | 'load_pending' // session started; van load awaiting confirmation
  | 'open' // load confirmed + float entered → selling unlocked
  | 'closing' // end-of-day: physical count + settlement in progress
  | 'closed'; // settled + locked

export type VanDayAction = 'start_day' | 'confirm_load' | 'begin_close' | 'settle';

/** Facts the gates read (supplied by the work session / load confirmation /
 *  settlement services at wiring time). Pure inputs here. */
export interface VanDayContext {
  /** The van load has been confirmed (accept / accept-with-variance). */
  loadConfirmed: boolean;
  /** The opening cash float has been entered. */
  cashFloatEntered: boolean;
  /** End-of-day physical stock count is complete. */
  countComplete: boolean;
  /** Cash + stock reconciliation ties out, or its variance is approved. */
  settlementBalanced: boolean;
  /** Queued offline documents not yet synced (must be 0 to close). */
  unsyncedDocs: number;
}

export const EMPTY_DAY_CONTEXT: VanDayContext = {
  loadConfirmed: false,
  cashFloatEntered: false,
  countComplete: false,
  settlementBalanced: false,
  unsyncedDocs: 0,
};

export type TransitionResult =
  | { ok: true; state: VanDayState }
  | { ok: false; reason: string };

/** Apply an action to the current state. Pure — returns the next state or the
 *  reason it is not allowed. The single source of truth for day legality. */
export function transition(state: VanDayState, action: VanDayAction, ctx: VanDayContext): TransitionResult {
  switch (action) {
    case 'start_day':
      if (state !== 'not_started') return { ok: false, reason: 'day_already_started' };
      return { ok: true, state: 'load_pending' };

    case 'confirm_load':
      if (state !== 'load_pending') return { ok: false, reason: 'not_awaiting_load' };
      if (!ctx.loadConfirmed) return { ok: false, reason: 'load_not_confirmed' };
      if (!ctx.cashFloatEntered) return { ok: false, reason: 'cash_float_required' };
      return { ok: true, state: 'open' };

    case 'begin_close':
      if (state !== 'open') return { ok: false, reason: 'day_not_open' };
      if (ctx.unsyncedDocs > 0) return { ok: false, reason: 'unsynced_documents' };
      return { ok: true, state: 'closing' };

    case 'settle':
      if (state !== 'closing') return { ok: false, reason: 'not_closing' };
      if (!ctx.countComplete) return { ok: false, reason: 'count_incomplete' };
      if (!ctx.settlementBalanced) return { ok: false, reason: 'settlement_unbalanced' };
      return { ok: true, state: 'closed' };

    default:
      return { ok: false, reason: 'unknown_action' };
  }
}

/** Selling is only allowed while the day is OPEN. Pure. */
export function canSell(state: VanDayState): boolean {
  return state === 'open';
}

/** Actions currently allowed from a state + context (drives the primary CTA). Pure. */
export function allowedActions(state: VanDayState, ctx: VanDayContext): VanDayAction[] {
  return (['start_day', 'confirm_load', 'begin_close', 'settle'] as VanDayAction[]).filter(
    (a) => transition(state, a, ctx).ok,
  );
}

/** The single dominant next step for the mobile "Today" CTA, or null when the
 *  day is closed / nothing actionable. Pure. */
export function primaryAction(state: VanDayState, ctx: VanDayContext): VanDayAction | null {
  return allowedActions(state, ctx)[0] ?? null;
}
