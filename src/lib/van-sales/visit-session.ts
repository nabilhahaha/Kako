// ============================================================================
// Visit session — tracks UNFINISHED operational work per customer so "Complete
// Visit" cannot accidentally close a visit while a sale / collection / return was
// started but not finished. The rep must complete the action (which clears its
// flag on success) or explicitly DISCARD it. Client-only (sessionStorage), so it
// survives in-visit navigation but not an app restart. No server/schema change.
// ============================================================================

export type VisitWorkAction = 'sell' | 'collect' | 'return';
export const VISIT_WORK_ACTIONS: VisitWorkAction[] = ['sell', 'collect', 'return'];

export type VisitWorkState = Partial<Record<VisitWorkAction, boolean>>;

const KEY = (customerId: string) => `kako.visitwork.${customerId}`;

/** Pure: the list of actions still marked unfinished in a state object. */
export function unfinishedActions(state: VisitWorkState | null | undefined): VisitWorkAction[] {
  if (!state) return [];
  return VISIT_WORK_ACTIONS.filter((a) => state[a] === true);
}

function read(customerId: string): VisitWorkState {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.sessionStorage.getItem(KEY(customerId));
    return raw ? (JSON.parse(raw) as VisitWorkState) : {};
  } catch {
    return {};
  }
}

function write(customerId: string, state: VisitWorkState) {
  if (typeof window === 'undefined') return;
  try {
    const remaining = unfinishedActions(state);
    if (remaining.length === 0) window.sessionStorage.removeItem(KEY(customerId));
    else window.sessionStorage.setItem(KEY(customerId), JSON.stringify(state));
  } catch {
    /* sessionStorage unavailable — guard is best-effort */
  }
}

/** Mark an action as started (unfinished) for a customer's open visit. */
export function markVisitWork(customerId: string, action: VisitWorkAction) {
  if (!customerId) return;
  const s = read(customerId);
  s[action] = true;
  write(customerId, s);
}

/** Clear an action's flag — called on the action's SUCCESS or explicit discard. */
export function clearVisitWork(customerId: string, action: VisitWorkAction) {
  if (!customerId) return;
  const s = read(customerId);
  delete s[action];
  write(customerId, s);
}

/** Clear ALL unfinished flags for a customer (explicit "discard & complete"). */
export function clearAllVisitWork(customerId: string) {
  if (typeof window === 'undefined' || !customerId) return;
  try { window.sessionStorage.removeItem(KEY(customerId)); } catch { /* noop */ }
}

/** Actions still unfinished for a customer (drives the Complete-Visit guard). */
export function listUnfinishedVisitWork(customerId: string): VisitWorkAction[] {
  return unfinishedActions(read(customerId));
}
