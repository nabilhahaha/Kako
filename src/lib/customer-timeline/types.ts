// ============================================================================
// Customer Timeline — domain types (Phase 3 FMCG). The immutable event record
// (maps 1:1 onto erp_customer_timeline) + the read-model shapes. Reuses the
// ownership ledger and references related records (no data duplication).
// ============================================================================

import type { TimelineCategory, TimelineEventType } from './catalog';

/** One immutable timeline event. */
export interface TimelineEvent {
  id?: string;
  companyId: string;
  customerId: string;
  eventType: TimelineEventType;
  eventCategory: TimelineCategory;
  eventAt: string;                 // ISO timestamp
  userId?: string | null;
  role?: string | null;
  sourceModule?: string | null;
  beforeValue?: unknown | null;
  afterValue?: unknown | null;
  reason?: string | null;
  notes?: string | null;
  relatedRecordType?: string | null;  // e.g. 'invoice', 'visit', 'return'
  relatedRecordId?: string | null;
  relatedEntity?: string | null;
  attachmentRef?: string | null;
}

/** Inputs derived from the timeline for health/risk scoring. */
export interface CustomerHealthInputs {
  daysSinceLastOrder: number | null;
  daysSinceLastVisit: number | null;
  daysSinceLastCollection: number | null;
  hasOverdue: boolean;
  nearExpiryOpen: number;
  returnsLast90: number;
  ordersLast90: number;
  tenureDays: number | null;
}
