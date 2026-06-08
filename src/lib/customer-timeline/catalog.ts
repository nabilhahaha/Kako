// ============================================================================
// Customer Timeline — event catalog (Phase 3 FMCG). Pure data mapping every
// significant customer event to a category. Event type is an OPEN string (future
// events need no redesign — just a catalog entry); KNOWN_TIMELINE_EVENTS lists the
// built-ins. Categories group the unified Customer-360 feed.
// ============================================================================

export type TimelineCategory =
  | 'creation' | 'ownership' | 'visit' | 'sales' | 'collection'
  | 'return' | 'near_expiry' | 'merchandising' | 'data_change'
  | 'trade_spend' | 'compliance';

/** Open event-type key (string) — extend via the catalog, never via schema. */
export type TimelineEventType = string;

/** Built-in event type → category. Append future events here. */
export const EVENT_CATALOG: Record<string, TimelineCategory> = {
  // creation / lifecycle
  customer_created: 'creation', customer_activated: 'creation', customer_reactivated: 'creation',
  customer_deactivated: 'creation', customer_lost: 'creation',
  // ownership
  assigned_to_salesman: 'ownership', reassigned_to_salesman: 'ownership', route_change: 'ownership',
  supervisor_change: 'ownership', area_change: 'ownership', region_change: 'ownership',
  // visits
  planned_visit: 'visit', completed_visit: 'visit', missed_visit: 'visit',
  route_riding_visit: 'visit', coaching_visit: 'visit',
  // sales
  first_order: 'sales', order_created: 'sales', order_approved: 'sales',
  invoice_issued: 'sales', invoice_cancelled: 'sales',
  // collections
  collection_recorded: 'collection', promise_to_pay: 'collection', partial_collection: 'collection',
  full_collection: 'collection', overdue_status: 'collection',
  // returns
  return_submitted: 'return', return_approved: 'return', credit_note_issued: 'return',
  // near expiry
  near_expiry_detected: 'near_expiry', recovery_action: 'near_expiry', return_action: 'near_expiry',
  // merchandising
  display_installed: 'merchandising', perfect_store_audit: 'merchandising',
  oos_detected: 'merchandising', oos_resolved: 'merchandising',
  // customer data changes
  gps_change: 'data_change', vat_change: 'data_change', cr_change: 'data_change',
  national_address_change: 'data_change', classification_change: 'data_change',
  channel_change: 'data_change', payment_terms_change: 'data_change', credit_limit_change: 'data_change',
  // trade spend
  listing_fee_approved: 'trade_spend', promotion_approved: 'trade_spend', visibility_agreement: 'trade_spend',
  claim_submitted: 'trade_spend', claim_approved: 'trade_spend', claim_rejected: 'trade_spend',
  // compliance
  eta_submission: 'compliance', zatca_submission: 'compliance', peppol_submission: 'compliance',
  compliance_failure: 'compliance', compliance_success: 'compliance',
};

export const KNOWN_TIMELINE_EVENTS: readonly string[] = Object.keys(EVENT_CATALOG);

/** Category for an event type ('creation' default for unknown — still recorded). Pure. */
export function categoryFor(eventType: TimelineEventType): TimelineCategory {
  return EVENT_CATALOG[eventType] ?? 'creation';
}
