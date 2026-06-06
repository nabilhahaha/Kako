// ============================================================================
// Offline-first sync — conflict resolution (pure, deterministic, commutative).
//
// Both peers must compute the SAME winner regardless of which side they evaluate
// first, so the system converges without a coordinator. Every function here is a
// pure function of its inputs (no clock, no IO). See design §8.
// ============================================================================

import type { ConflictPolicy, RemoteRecord } from './types';

/** A row as it exists locally — the conflict counterpart to RemoteRecord. */
export interface LocalRecord {
  pk: string;
  version: number;
  updatedAt: number;
  origin: 'local' | 'cloud';
  deleted: boolean;
  data: Record<string, unknown>;
}

export type Winner = 'local' | 'remote' | 'merged';

export interface ConflictResult {
  winner: Winner;
  data: Record<string, unknown>;
  deleted: boolean;
  reason: string;
}

function shallowEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Deterministic last-write-wins. Newer `updatedAt` wins; ties broken by higher
 * `version`, then by cloud origin, then (final, stable) by lexical pk — so the
 * outcome is identical on every device.
 */
export function lastWriteWins(local: LocalRecord, remote: RemoteRecord): ConflictResult {
  let pickRemote: boolean;
  if (remote.updatedAt !== local.updatedAt) {
    pickRemote = remote.updatedAt > local.updatedAt;
  } else if (remote.version !== local.version) {
    pickRemote = remote.version > local.version;
  } else if (remote.origin !== local.origin) {
    pickRemote = remote.origin === 'cloud';
  } else {
    pickRemote = true; // fully symmetric → converge on the remote copy
  }
  return pickRemote
    ? { winner: 'remote', data: remote.data, deleted: remote.deleted, reason: 'lww:remote-newer' }
    : { winner: 'local', data: local.data, deleted: local.deleted, reason: 'lww:local-newer' };
}

/**
 * Field-level merge against a common `base`. Per key: if only one side changed
 * vs base, take it; if both changed, fall back to LWW for that key. Deletes are
 * resolved by LWW on the whole record (a delete is not a field edit).
 */
export function fieldMerge(
  base: Record<string, unknown> | null,
  local: LocalRecord,
  remote: RemoteRecord,
): ConflictResult {
  if (local.deleted || remote.deleted) {
    const lww = lastWriteWins(local, remote);
    return { ...lww, winner: 'merged', reason: `merge:delete→${lww.reason}` };
  }
  const remoteNewer = remote.updatedAt >= local.updatedAt;
  const keys = new Set([...Object.keys(local.data), ...Object.keys(remote.data)]);
  const merged: Record<string, unknown> = {};
  for (const k of keys) {
    const lv = local.data[k];
    const rv = remote.data[k];
    const lChanged = !base || !shallowEqual(lv, base[k]);
    const rChanged = !base || !shallowEqual(rv, base[k]);
    if (lChanged && !rChanged) merged[k] = lv;
    else if (rChanged && !lChanged) merged[k] = rv;
    else if (!lChanged && !rChanged) merged[k] = base ? base[k] : lv;
    else merged[k] = remoteNewer ? rv : lv; // both changed → LWW on the field
  }
  return { winner: 'merged', data: merged, deleted: false, reason: 'merge:field-level' };
}

/** Resolve a conflict per the entity's policy. */
export function resolveConflict(
  policy: ConflictPolicy,
  local: LocalRecord,
  remote: RemoteRecord,
  base: Record<string, unknown> | null = null,
): ConflictResult {
  switch (policy) {
    case 'server-wins':
      return { winner: 'remote', data: remote.data, deleted: remote.deleted, reason: 'policy:server-wins' };
    case 'client-wins':
      return { winner: 'local', data: local.data, deleted: local.deleted, reason: 'policy:client-wins' };
    case 'field-merge':
      return fieldMerge(base, local, remote);
    case 'last-write-wins':
    default:
      return lastWriteWins(local, remote);
  }
}
