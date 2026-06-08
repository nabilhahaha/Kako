// ============================================================================
// Ownership History — pure engine (Phase 3 FMCG, shared foundation). Point-in-time
// ownership resolution + non-overwriting change planning + overlap validation. No
// DB, no clock side-effects (times injected). Maps onto erp_ownership_history.
// ============================================================================

import type { OwnershipRecord, OwnershipEntityType, OwnerType, OwnershipChangePlan } from './types';

function matches(r: OwnershipRecord, entityType: OwnershipEntityType, entityId: string, ownerType: OwnerType): boolean {
  return r.entityType === entityType && r.entityId === entityId && r.ownerType === ownerType;
}

/** True when `at` falls within [effectiveFrom, effectiveTo). Pure. */
export function covers(r: OwnershipRecord, at: string): boolean {
  return r.effectiveFrom <= at && (r.effectiveTo == null || at < r.effectiveTo);
}

/**
 * The owner of an entity (for an owner dimension) at instant `at` — the basis for
 * attributing execution-time KPIs to the correct owner. Returns ownerId or null. Pure.
 */
export function ownerAt(
  records: readonly OwnershipRecord[],
  entityType: OwnershipEntityType,
  entityId: string,
  ownerType: OwnerType,
  at: string,
): string | null {
  const hit = records.find((r) => matches(r, entityType, entityId, ownerType) && covers(r, at));
  return hit?.ownerId ?? null;
}

/** The currently-open owner (effectiveTo null) for a dimension. Pure. */
export function currentOwner(
  records: readonly OwnershipRecord[],
  entityType: OwnershipEntityType,
  entityId: string,
  ownerType: OwnerType,
): string | null {
  const open = records.find((r) => matches(r, entityType, entityId, ownerType) && r.effectiveTo == null);
  return open?.ownerId ?? null;
}

/** Full chronological ownership history for an entity (optionally one dimension). Pure. */
export function historyFor(
  records: readonly OwnershipRecord[],
  entityType: OwnershipEntityType,
  entityId: string,
  ownerType?: OwnerType,
): OwnershipRecord[] {
  return records
    .filter((r) => r.entityType === entityType && r.entityId === entityId && (ownerType ? r.ownerType === ownerType : true))
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
}

/**
 * Plan an ownership change WITHOUT overwriting history: close the current open
 * interval at `at` and open a new one for `newOwnerId`. Returns no-op-friendly
 * plan (close=null when none open). Pure — the caller persists the plan.
 */
export function planOwnershipChange(
  records: readonly OwnershipRecord[],
  entityType: OwnershipEntityType,
  entityId: string,
  ownerType: OwnerType,
  newOwnerId: string,
  at: string,
  reason?: string | null,
): OwnershipChangePlan {
  const open = records.find((r) => matches(r, entityType, entityId, ownerType) && r.effectiveTo == null);
  return {
    close: open ? { record: open, effectiveTo: at } : null,
    open: { entityType, entityId, ownerType, ownerId: newOwnerId, effectiveFrom: at, effectiveTo: null, reason: reason ?? null },
  };
}

/**
 * Detect overlapping intervals for the same (entity, ownerType) — an invariant
 * violation (only one owner at a time). Returns offending pairs. Pure.
 */
export function findOverlaps(records: readonly OwnershipRecord[]): [OwnershipRecord, OwnershipRecord][] {
  const out: [OwnershipRecord, OwnershipRecord][] = [];
  const groups = new Map<string, OwnershipRecord[]>();
  for (const r of records) {
    const k = `${r.entityType}|${r.entityId}|${r.ownerType}`;
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
  }
  for (const g of groups.values()) {
    const sorted = [...g].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      const prevEnd = prev.effectiveTo ?? '9999-12-31T23:59:59Z';
      if (cur.effectiveFrom < prevEnd) out.push([prev, cur]);
    }
  }
  return out;
}
