// ============================================================================
// Local-first write seam (browser). The app records every business mutation
// here; behind KAKO_SYNC it is journaled to the durable IndexedDB outbox and
// synced in the background. When KAKO_SYNC is off this is a NO-OP, so callers can
// be wired unconditionally without changing current production behavior.
//
// A single shared WebLocalStore instance is reused (opened lazily / set by the
// SyncProvider) so the seam and the orchestrator operate on the same outbox.
// ============================================================================

import type { SyncOp } from '../types';
import type { WebLocalStore } from './web-store';
import { isSyncEnabledClient } from '../flag';

let shared: WebLocalStore | null = null;
let opening: Promise<WebLocalStore> | null = null;
/** Optional hook so the seam can nudge the orchestrator to sync immediately. */
let kick: (() => void) | null = null;

/** Provide the orchestrator's store (called by SyncProvider on boot). */
export function setSyncStore(store: WebLocalStore, onKick?: () => void): void {
  shared = store;
  kick = onKick ?? null;
}

export function clearSyncStore(): void {
  shared = null;
  opening = null;
  kick = null;
}

async function getStore(): Promise<WebLocalStore> {
  if (shared) return shared;
  if (!opening) {
    // Lazily import to keep IndexedDB out of the bundle/runtime when off.
    opening = import('./web-store').then(({ WebLocalStore }) => WebLocalStore.open());
  }
  shared = await opening;
  return shared;
}

/** Shared store accessor for read-only UIs (Sync console). Opens lazily. */
export function getSyncStore(): Promise<WebLocalStore> {
  return getStore();
}

export interface MutationInput {
  entity: string;
  op: SyncOp;
  pk: string;
  payload: Record<string, unknown>;
  /** The row sync_version this change derives from (null for inserts). */
  baseVersion?: number | null;
}

/**
 * Record a mutation locally-first. Returns the clientOpId (idempotency key) when
 * journaled, or null when sync is disabled (the caller's normal cloud write is
 * the system of record in that case). Never throws into the caller's flow.
 */
export async function recordMutation(input: MutationInput): Promise<string | null> {
  if (!isSyncEnabledClient() || typeof window === 'undefined') return null;
  try {
    const store = await getStore();
    const entry = await store.enqueue({
      entity: input.entity, op: input.op, pk: input.pk,
      payload: input.payload, baseVersion: input.baseVersion ?? null,
    });
    kick?.();
    return entry.clientOpId;
  } catch (e) {
    // A journaling failure must not break the user's action; it will be retried
    // on the next mutation/connectivity tick once the store is healthy.
    console.error('recordMutation failed', e);
    return null;
  }
}
