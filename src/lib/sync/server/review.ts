// ============================================================================
// Inventory-counts conflict-review resolution (pure, §14 review workflow).
//
// When a counted quantity is pushed against a cloud row that has since moved, the
// server parks it (apply.ts → flagReview) instead of guessing. An admin then
// resolves each parked item: keep the counted (local) value, or accept the cloud
// value. This module is the pure decision; the route applies it via the DB seam.
// ============================================================================

import type { RemoteRecord } from '../types';

export type ReviewChoice = 'keep-local' | 'keep-cloud';

export interface ReviewItem {
  id: number;
  companyId: string;
  entity: string;
  pk: string;
  clientOpId: string;
  baseVersion: number | null;
  proposed: Record<string, unknown>;   // the counted (local) value
  remoteVersion: number;
  remote: Record<string, unknown>;      // the current cloud value
}

export type ReviewResolution =
  | { action: 'commit'; row: RemoteRecord; ingestClientOpId: string }
  | { action: 'discard' };

/** Resolve one parked review. keep-local commits the counted value as the next
 *  version (idempotent via the original clientOpId); keep-cloud drops the local
 *  op (the client will pull the cloud value). Deterministic, no IO. */
export function resolveReviewRow(choice: ReviewChoice, item: ReviewItem, now: number): ReviewResolution {
  if (choice === 'keep-cloud') return { action: 'discard' };
  return {
    action: 'commit',
    ingestClientOpId: item.clientOpId,
    row: {
      entity: item.entity, pk: item.pk, version: item.remoteVersion + 1,
      updatedAt: now, origin: 'cloud', deleted: false, data: item.proposed,
    },
  };
}
