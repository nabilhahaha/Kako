// ============================================================================
// Ownership History — domain types (Phase 3 FMCG, shared foundation). A generic,
// effective-dated ownership ledger reused by Territory Planning, Route Riding,
// KPI attribution, and the Customer Timeline. Ownership is NEVER overwritten:
// changes close the prior interval (effective_to) and open a new one. Point-in-
// time queries make sales/collections/coverage/compliance/KPIs attributable to
// the owner AT THE TIME OF EXECUTION.
// ============================================================================

/** What is owned. */
export type OwnershipEntityType = 'customer' | 'route' | 'salesman' | 'supervisor' | 'area' | 'region';

/** Who owns it. */
export type OwnerType = 'salesman' | 'supervisor' | 'area_manager' | 'regional_manager' | 'route' | 'area' | 'region';

/** One effective-dated ownership interval. `effectiveTo` null = currently open. */
export interface OwnershipRecord {
  entityType: OwnershipEntityType;
  entityId: string;
  ownerType: OwnerType;
  ownerId: string;
  effectiveFrom: string;          // ISO timestamp
  effectiveTo?: string | null;    // ISO timestamp, null = open
  reason?: string | null;
}

/** The mutation plan for an ownership change (never overwrites; pure). */
export interface OwnershipChangePlan {
  /** The prior open record to close (set its effectiveTo), if any. */
  close: { record: OwnershipRecord; effectiveTo: string } | null;
  /** The new record to insert. */
  open: OwnershipRecord;
}
