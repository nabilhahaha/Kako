// ============================================================================
// Offline-first sync — outbox scheduling/state (pure functions over entries).
//
// The real journal is a SQL table (sync_outbox), but the scheduling, dedupe,
// backoff and state-transition logic is pure and lives here so it is fully
// unit-testable and identical on every platform. See design §5–§7.
// ============================================================================

import type { OutboxEntry, PushOutcome } from './types';

/** After this many failed attempts an entry is "dead-lettered": it stays
 *  `failed` and is surfaced in the Sync status UI rather than retried forever. */
export const MAX_ATTEMPTS = 8;

/** Exponential backoff with a cap. attempts=0 → base; doubles each attempt. */
export function backoffMs(attempts: number, baseMs = 1000, capMs = 5 * 60 * 1000): number {
  const safe = Math.max(0, Math.floor(attempts));
  return Math.min(capMs, baseMs * 2 ** safe);
}

/** An entry is eligible to (re)send when pending/failed and its backoff elapsed. */
export function isDue(e: OutboxEntry, now: number): boolean {
  return (e.status === 'pending' || e.status === 'failed') && e.nextAttemptAt <= now && e.attempts < MAX_ATTEMPTS;
}

/** Dead-lettered = exhausted retries; never silently dropped. */
export function isDeadLettered(e: OutboxEntry): boolean {
  return e.status === 'failed' && e.attempts >= MAX_ATTEMPTS;
}

/** Stable FIFO selection of due entries (oldest first), capped at `limit`. */
export function nextBatch(entries: OutboxEntry[], now: number, limit: number): OutboxEntry[] {
  return entries
    .filter((e) => isDue(e, now))
    .sort((a, b) => a.createdAt - b.createdAt || a.id - b.id)
    .slice(0, Math.max(0, limit));
}

/** Keep only the first entry per clientOpId (defends against accidental dupes). */
export function dedupeByClientOpId(entries: OutboxEntry[]): OutboxEntry[] {
  const seen = new Set<string>();
  const out: OutboxEntry[] = [];
  for (const e of entries) {
    if (seen.has(e.clientOpId)) continue;
    seen.add(e.clientOpId);
    out.push(e);
  }
  return out;
}

/** Apply a push outcome to an entry, returning the next entry state (pure). */
export function applyOutcome(entry: OutboxEntry, outcome: PushOutcome, now: number): OutboxEntry {
  switch (outcome.status) {
    case 'ok':
      return { ...entry, status: 'synced', lastError: undefined };
    case 'conflict':
      // The engine resolves conflicts; mark for handling and don't burn an attempt.
      return { ...entry, status: 'conflict' };
    case 'error': {
      const attempts = entry.attempts + 1;
      return {
        ...entry,
        status: 'failed',
        attempts,
        lastError: outcome.error,
        nextAttemptAt: now + backoffMs(attempts),
      };
    }
  }
}
