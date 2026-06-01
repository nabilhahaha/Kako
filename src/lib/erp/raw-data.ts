import type { SupabaseClient } from '@supabase/supabase-js';

/** ── Raw Data Framework (Platform Foundation #4) ──────────────────────────
 *  Canonical analytics layer. Every module emits standardized facts into
 *  erp_raw_facts via erp_raw_emit — so Customer 360, AI and enterprise
 *  reporting read one stable schema instead of per-module reporting tables.
 *  Future modules (Visits, Merchandising, Inventory, Trade Spend, Old Expiry,
 *  Sales Execution, …) call emitFact() with the dimensions they have. */

export interface RawFact {
  // Business
  entityType?: string; entityId?: string; actionType?: string;
  // Identity
  companyId?: string; branchId?: string; region?: string; area?: string;
  routeId?: string; customerId?: string; userId?: string; role?: string;
  // Time
  eventAt?: string; approvedAt?: string; completedAt?: string;
  // Workflow
  workflowInstanceId?: string; requestType?: string; requestStatus?: string;
  approverId?: string; approvalLevel?: number;
  // Location
  gpsLat?: number; gpsLng?: number; geofenceResult?: string; locationSource?: string;
  // Financial
  quantity?: number; amount?: number; currency?: string; uom?: string; cost?: number; grossProfit?: number;
  // Attachments
  attachmentCount?: number; attachmentType?: string;
  // Source link (drill-through / idempotency)
  sourceTable?: string; sourceId?: string;
  // Module-specific extras
  details?: Record<string, unknown>;
}

const KEY_MAP: Record<keyof Omit<RawFact, 'details'>, string> = {
  entityType: 'entity_type', entityId: 'entity_id', actionType: 'action_type',
  companyId: 'company_id', branchId: 'branch_id', region: 'region', area: 'area',
  routeId: 'route_id', customerId: 'customer_id', userId: 'user_id', role: 'role',
  eventAt: 'event_at', approvedAt: 'approved_at', completedAt: 'completed_at',
  workflowInstanceId: 'workflow_instance_id', requestType: 'request_type', requestStatus: 'request_status',
  approverId: 'approver_id', approvalLevel: 'approval_level',
  gpsLat: 'gps_lat', gpsLng: 'gps_lng', geofenceResult: 'geofence_result', locationSource: 'location_source',
  quantity: 'quantity', amount: 'amount', currency: 'currency', uom: 'uom', cost: 'cost', grossProfit: 'gross_profit',
  attachmentCount: 'attachment_count', attachmentType: 'attachment_type',
  sourceTable: 'source_table', sourceId: 'source_id',
};

/** Append a standardized analytics fact for a module. company_id / user_id
 *  default from the caller's auth context when omitted. */
export async function emitFact(
  supabase: SupabaseClient,
  module: string,
  eventType: string,
  fact: RawFact = {},
): Promise<void> {
  const f: Record<string, unknown> = { ...(fact.details ?? {}) };
  for (const [tsKey, sqlKey] of Object.entries(KEY_MAP)) {
    const v = (fact as Record<string, unknown>)[tsKey];
    if (v !== undefined && v !== null) f[sqlKey] = v;
  }
  await supabase.rpc('erp_raw_emit', { p_module: module, p_event_type: eventType, p_fact: f });
}
