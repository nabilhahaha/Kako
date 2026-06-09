// Critical Alerts Framework — PURE evaluation planning. Given the candidates a
// source currently raises and the dedupe keys of a rule's still-live alerts,
// decide what to upsert (raise/refresh) and what to auto-resolve (condition
// cleared). No I/O. The server orchestrator applies the plan.

import type { AlertCandidate } from './types';

export interface AlertSyncPlan {
  raise: AlertCandidate[];        // firing now → insert-or-refresh
  resolveDedupeKeys: string[];    // live before, not firing now → resolve (cleared)
}

/**
 * @param candidates  what the source raises this run (already deduped by key upstream)
 * @param liveDedupeKeys  dedupe keys of this rule's alerts still in a non-resolved state
 */
export function planAlertSync(candidates: AlertCandidate[], liveDedupeKeys: string[]): AlertSyncPlan {
  const firing = new Set(candidates.map((c) => c.dedupeKey));
  // de-dupe candidates by key (a source might yield the same subject twice)
  const seen = new Set<string>();
  const raise = candidates.filter((c) => (seen.has(c.dedupeKey) ? false : (seen.add(c.dedupeKey), true)));
  const resolveDedupeKeys = liveDedupeKeys.filter((k) => !firing.has(k));
  return { raise, resolveDedupeKeys };
}
