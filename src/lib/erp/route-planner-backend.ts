/**
 * Route Planner backend — canonical types, constants and the connector interface for
 * the persistence layer (migrations 0354–0356). Self-contained and ERP-independent.
 *
 *   Reporting graph (0354)  → visibility derived from primary/secondary manager edges
 *   Integration (0355)      → pluggable data sources + per-entity mappings + sync runs
 *   Request Center (0356)   → tickets + configurable approval flows
 *
 * Permissions (role/features) · Visibility (reporting graph) · Reporting (the edges)
 * and Territory ownership are all INDEPENDENT concepts — never coupled here.
 */

// ── Integration ─────────────────────────────────────────────────────────────
export const RP_SOURCE_TYPES = ['manual_upload', 'google_sheets', 'api_erp', 'scheduled'] as const;
export type RpSourceType = (typeof RP_SOURCE_TYPES)[number];

/** The optional business datasets a source can carry (all optional except customer name+GPS). */
export const RP_ENTITIES = ['customer_master', 'sales', 'visits', 'credit', 'routes', 'returns', 'targets', 'hierarchy'] as const;
export type RpEntity = (typeof RP_ENTITIES)[number];

/** Cross-dataset Data-Health checks run on each sync. */
export const RP_QUALITY_CHECKS = [
  'missing_customer_code', 'duplicate_customer', 'missing_gps', 'invalid_salesman',
  'customer_no_route', 'sales_no_route', 'route_customer_missing', 'credit_no_customer',
  'return_no_customer', 'return_no_sales', 'target_no_owner',
] as const;
export type RpQualityCheck = (typeof RP_QUALITY_CHECKS)[number];

export interface RpDataSource {
  id: string; companyId: string; name: string; type: RpSourceType;
  status: 'active' | 'paused' | 'error'; config: Record<string, unknown>;
  schedule: string | null; lastSyncAt: string | null; lastStatus: string | null;
}
export interface RpFieldMapping { id: string; sourceId: string; entity: RpEntity; mapping: Record<string, string> }
export interface RpSyncRun {
  id: string; sourceId: string | null; companyId: string; trigger: 'manual' | 'scheduled';
  sourceLabel: string | null; startedAt: string; finishedAt: string | null;
  status: 'running' | 'success' | 'failed' | 'partial';
  rowsImported: number; rowsUpdated: number; rowsRejected: number;
  errors: unknown[]; quality: Partial<Record<RpQualityCheck, number>>;
}

/** The ONLY thing each new source implements; everything downstream (map/validate/
 *  quality/history) is shared. */
export type RawRow = Record<string, string>;
export interface DataConnector {
  type: RpSourceType;
  fetchRows(config: Record<string, unknown>, entity: RpEntity): Promise<RawRow[]>;
}

// ── Reporting graph (visibility) ─────────────────────────────────────────────
export const RP_RELATIONS = ['direct_manager', 'managers_manager', 'subtree'] as const;
export type RpRelation = (typeof RP_RELATIONS)[number];

// ── Request Center ───────────────────────────────────────────────────────────
export const RP_TICKET_TYPES = ['new_customer', 'update', 'temp_stop', 'perm_stop', 'reassignment', 'location_fix', 'route_change'] as const;
export type RpTicketType = (typeof RP_TICKET_TYPES)[number];

export const RP_TICKET_STATUSES = [
  'created', 'pending_manager_review', 'approved', 'pending_admin_action',
  'implemented_externally', 'closed', 'rejected', 'need_more_info', 'cancelled',
] as const;
export type RpTicketStatus = (typeof RP_TICKET_STATUSES)[number];

/** GPS + photo are required proof for these ticket types. */
export const RP_PROOF_REQUIRED: RpTicketType[] = ['location_fix', 'temp_stop', 'perm_stop'];

export interface RpRequest {
  id: string; companyId: string; ticketNo: string | null; type: RpTicketType;
  requestedBy: string | null; requestedRole: string | null;
  customerRef: string | null; customerId: string | null;
  changes: Record<string, { old?: string; new?: string }>;
  reason: string | null; attachments: unknown[]; gpsLat: number | null; gpsLng: number | null;
  status: RpTicketStatus; currentStage: string | null; assigneeId: string | null;
  events: unknown[]; reconciliation: unknown | null;
}

// ── Approval Builder ─────────────────────────────────────────────────────────
export const RP_APPROVAL_STAGES = ['create', 'review', 'approve', 'implement', 'close'] as const;
export type RpApprovalStage = (typeof RP_APPROVAL_STAGES)[number];
export const RP_ASSIGN_METHODS = ['role', 'relation', 'user'] as const;
export type RpAssignMethod = (typeof RP_ASSIGN_METHODS)[number];

export interface RpApprovalStep {
  stage: RpApprovalStage;
  assignBy: RpAssignMethod;
  role?: string;
  relation?: RpRelation;
  userId?: string;
}
export interface RpApprovalFlow { id: string; companyId: string; ticketType: RpTicketType; steps: RpApprovalStep[]; isActive: boolean }

/** Default, ready-to-use approval templates (the admin can pick/edit per ticket type). */
export const RP_APPROVAL_TEMPLATES: Record<'simple' | 'multi_level' | 'admin_only', RpApprovalStep[]> = {
  // A — Creator → Direct Manager → Company Admin
  simple: [
    { stage: 'create', assignBy: 'role', role: 'field_user' },
    { stage: 'approve', assignBy: 'relation', relation: 'direct_manager' },
    { stage: 'close', assignBy: 'role', role: 'route_planner_admin' },
  ],
  // B — Creator → Direct Manager → Regional Manager → Company Admin
  multi_level: [
    { stage: 'create', assignBy: 'role', role: 'field_user' },
    { stage: 'review', assignBy: 'relation', relation: 'direct_manager' },
    { stage: 'approve', assignBy: 'relation', relation: 'managers_manager' },
    { stage: 'close', assignBy: 'role', role: 'route_planner_admin' },
  ],
  // C — Creator → Company Admin
  admin_only: [
    { stage: 'create', assignBy: 'role', role: 'field_user' },
    { stage: 'approve', assignBy: 'role', role: 'route_planner_admin' },
  ],
};
