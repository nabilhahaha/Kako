// ============================================================================
// Offline-safe server-action wrapper (design §5/§7, browser edition).
//
// Wraps a cloud server-action call so a dropped connection never throws a fatal,
// user-visible error. Online: behaves exactly like calling the action, then
// journals the mutation built from the server result so the local mirror stays
// in step. Offline (the action's fetch rejects): journals the mutation with a
// client-supplied identity so the orchestrator replays it once back online, and
// returns a synthetic offline-success instead of throwing.
//
// Entirely inert unless KAKO_SYNC is enabled: with the flag off this is a direct
// passthrough to the action (and recordMutation is itself a no-op), so the
// current production behavior — including how genuine network errors surface — is
// unchanged.
// ============================================================================

import { recordMutation, type MutationInput } from './write-seam';
import { isSyncEnabledClient } from '../flag';

/** A dropped-connection failure (vs. a genuine application error we must surface). */
export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const err = e as { message?: string; name?: string } | null;
  const m = `${err?.message ?? ''} ${err?.name ?? ''}`.toLowerCase();
  return /failed to fetch|load failed|networkerror|fetch failed|network request failed|err_internet|err_network|connection|timeout/.test(m);
}

export interface ActionLike<T> { ok: boolean; error?: string; data?: T }
export interface OfflineSafeResult<T> extends ActionLike<T> { offline?: boolean }

export interface SubmitOfflineOptions<T> {
  action: () => Promise<ActionLike<T>>;
  /**
   * Build the mutation to journal. Receives the server result `data` on success,
   * or `null` when offline (supply a client-generated pk for inserts). Return
   * `null` to skip journaling for this case.
   */
  mutation: (data: T | null) => MutationInput | null;
}

export async function submitOffline<T>(opts: SubmitOfflineOptions<T>): Promise<OfflineSafeResult<T>> {
  // Flag off → exact passthrough: run the action, journal on success (no-op when
  // off), and let any network error propagate just as it does today.
  if (!isSyncEnabledClient()) {
    const res = await opts.action();
    if (res.ok) { const m = opts.mutation(res.data ?? null); if (m) void recordMutation(m); }
    return res;
  }

  try {
    const res = await opts.action();
    if (res.ok) { const m = opts.mutation(res.data ?? null); if (m) void recordMutation(m); }
    return res;
  } catch (e) {
    if (!isNetworkError(e)) throw e; // genuine fault → surface it
    const m = opts.mutation(null);
    if (m) await recordMutation(m);
    return { ok: true, offline: true };
  }
}
