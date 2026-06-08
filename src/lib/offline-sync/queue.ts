// ============================================================================
// Offline Sync — queue model (Phase 7B). Pure. Orders queued mutations
// deterministically (per-device client_seq), deduplicates by idempotency key
// (at-least-once delivery → exactly-once apply), and batches for upload. No I/O.
// ============================================================================

import type { OfflineMutation } from './types';

/** Order mutations for apply: by device, then client_seq (causal order). Pure. */
export function orderMutations(mutations: readonly OfflineMutation[]): OfflineMutation[] {
  return [...mutations].sort((a, b) =>
    a.deviceId.localeCompare(b.deviceId) || a.clientSeq - b.clientSeq || a.clientTs.localeCompare(b.clientTs));
}

/** Drop duplicates by idempotency key, keeping the first occurrence. Pure. */
export function dedupeMutations(mutations: readonly OfflineMutation[]): OfflineMutation[] {
  const seen = new Set<string>();
  const out: OfflineMutation[] = [];
  for (const m of orderMutations(mutations)) {
    if (seen.has(m.idempotencyKey)) continue;
    seen.add(m.idempotencyKey);
    out.push(m);
  }
  return out;
}

/** Which idempotency keys are already applied server-side (skip them). Pure. */
export function filterAlreadyApplied(mutations: readonly OfflineMutation[], appliedKeys: ReadonlySet<string>): OfflineMutation[] {
  return dedupeMutations(mutations).filter((m) => !appliedKeys.has(m.idempotencyKey));
}

/** Split ordered, deduped mutations into upload batches of `size`. Pure. */
export function batchMutations(mutations: readonly OfflineMutation[], size = 100): OfflineMutation[][] {
  const ordered = dedupeMutations(mutations);
  const out: OfflineMutation[][] = [];
  for (let i = 0; i < ordered.length; i += Math.max(1, size)) out.push(ordered.slice(i, i + Math.max(1, size)));
  return out;
}
