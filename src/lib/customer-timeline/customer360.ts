// ============================================================================
// Customer Timeline — Customer 360 read-model (Phase 3 FMCG). Pure aggregation of
// the timeline feed + health scores + the REUSED ownership history (@/lib/ownership)
// into one Customer-360 payload. No I/O — a thin page/action wraps it.
// ============================================================================

import { historyFor, currentOwner, type OwnershipRecord, type OwnerType } from '@/lib/ownership';
import { buildFeed, categoryCounts } from './feed';
import { deriveHealthInputs, healthScore, riskScore, relationshipStrength, customerHealthTimeline } from './health';
import type { TimelineEvent } from './types';

const OWNER_DIMENSIONS: OwnerType[] = ['salesman', 'supervisor', 'area', 'region', 'route'];

/** Build the full Customer-360 view for `customerId` as of `asOf`. Pure. */
export function customer360(
  events: readonly TimelineEvent[],
  ownership: readonly OwnershipRecord[],
  customerId: string,
  asOf: string = new Date().toISOString(),
) {
  const feed = buildFeed(events);
  const inputs = deriveHealthInputs(events, asOf);
  const currentOwners: Record<string, string | null> = {};
  for (const dim of OWNER_DIMENSIONS) currentOwners[dim] = currentOwner(ownership, 'customer', customerId, dim);
  return {
    customerId,
    feed,
    categoryCounts: categoryCounts(events),
    health: {
      timeline: customerHealthTimeline(events),
      inputs,
      healthScore: healthScore(inputs),
      riskScore: riskScore(inputs),
      relationshipStrength: relationshipStrength(inputs),
    },
    ownershipHistory: historyFor(ownership, 'customer', customerId),
    currentOwners,
  };
}
