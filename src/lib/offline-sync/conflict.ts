// ============================================================================
// Offline Sync — conflict resolution + apply planning (Phase 7B). Pure. Resolves
// a queued mutation against the current server record per the entity's conflict
// policy: server-authoritative (ledgered entities → conflict, server wins) or
// last-write-wins (apply only when the client's base matches, else field-merge by
// recency). Produces an apply plan (apply / conflict / rejected) — no I/O.
// ============================================================================

import type { OfflineMutation, ServerRecord, ConflictPolicy } from './types';
import { DEFAULT_CONFLICT_POLICIES } from './types';

export type Resolution = 'apply' | 'conflict' | 'rejected';

export interface ResolvedMutation {
  idempotencyKey: string;
  resolution: Resolution;
  reason?: string;
  /** The fields to write when resolution === 'apply'. */
  effectiveFields?: Record<string, unknown>;
}

/** Policy for an entity (default LWW; protected entities are server-authoritative). Pure. */
export function policyFor(entity: string, overrides: Record<string, ConflictPolicy> = {}): ConflictPolicy {
  return overrides[entity] ?? DEFAULT_CONFLICT_POLICIES[entity] ?? 'last_write_wins';
}

/**
 * Resolve one mutation against the server record (null when the server has no row
 * — e.g. a create). Pure.
 */
export function resolveMutation(
  m: OfflineMutation,
  server: ServerRecord | null,
  policies: Record<string, ConflictPolicy> = {},
): ResolvedMutation {
  const policy = policyFor(m.entity, policies);

  if (m.operation === 'create') {
    return server
      ? { idempotencyKey: m.idempotencyKey, resolution: 'conflict', reason: 'create target already exists' }
      : { idempotencyKey: m.idempotencyKey, resolution: 'apply', effectiveFields: m.payload };
  }

  if (!server) {
    return { idempotencyKey: m.idempotencyKey, resolution: 'rejected', reason: 'target not found' };
  }

  if (m.operation === 'delete') {
    return policy === 'server_authoritative'
      ? { idempotencyKey: m.idempotencyKey, resolution: 'conflict', reason: 'delete blocked on server-authoritative entity' }
      : { idempotencyKey: m.idempotencyKey, resolution: 'apply' };
  }

  // update
  if (policy === 'server_authoritative') {
    return { idempotencyKey: m.idempotencyKey, resolution: 'conflict', reason: 'server-authoritative entity; device edit not applied' };
  }
  // last-write-wins: clean apply when the client edited the current server version;
  // otherwise field-merge — client fields win only if the client acted after the server.
  if (m.baseVersion && m.baseVersion === server.version) {
    return { idempotencyKey: m.idempotencyKey, resolution: 'apply', effectiveFields: { ...server.fields, ...m.payload } };
  }
  const clientIsNewer = m.clientTs > server.version;
  return clientIsNewer
    ? { idempotencyKey: m.idempotencyKey, resolution: 'apply', reason: 'stale base; field-merged (client newer)', effectiveFields: { ...server.fields, ...m.payload } }
    : { idempotencyKey: m.idempotencyKey, resolution: 'conflict', reason: 'stale base; server newer' };
}

export interface ApplyPlan {
  apply: ResolvedMutation[];
  conflicts: ResolvedMutation[];
  rejected: ResolvedMutation[];
}

/** Plan a batch: resolve each mutation against its server record (by entityId). Pure. */
export function planApply(
  mutations: readonly OfflineMutation[],
  serverByKey: (m: OfflineMutation) => ServerRecord | null,
  policies: Record<string, ConflictPolicy> = {},
): ApplyPlan {
  const plan: ApplyPlan = { apply: [], conflicts: [], rejected: [] };
  for (const m of mutations) {
    const r = resolveMutation(m, serverByKey(m), policies);
    if (r.resolution === 'apply') plan.apply.push(r);
    else if (r.resolution === 'conflict') plan.conflicts.push(r);
    else plan.rejected.push(r);
  }
  return plan;
}
