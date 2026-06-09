// Universal Change Request engine — strongly-typed metadata model. The DATABASE
// (erp_change_request_entities) is the canonical source of truth; these types +
// the parser in registry.ts wrap it to preserve type safety in app code.

/** Request lifecycle states (mirrors the CHECK on erp_change_requests.status). */
export type ChangeRequestStatus =
  | 'draft' | 'submitted' | 'pending' | 'approved' | 'scheduled'
  | 'applying' | 'applied' | 'partially_applied' | 'failed' | 'rejected' | 'cancelled';

/** Single-record vs bulk request. */
export type ChangeRequestScope = 'single' | 'bulk';

/** Per-target application status (mirrors erp_change_request_targets.status). */
export type TargetStatus = 'pending' | 'applied' | 'failed' | 'skipped';

/** One declarative validation rule for a governed field. Anything bespoke is a
 *  NAMED validator (registered in code) referenced via `validator`. */
export interface ValidationRule {
  field: string;
  required?: boolean;
  type?: 'string' | 'number' | 'boolean' | 'date';
  min?: number;
  max?: number;
  regex?: string;
  enum?: (string | number)[];
  reference?: string;        // a table that must contain the value
  validator?: string;        // a named code validator
  requiresDocType?: string;  // a doc_type that must be attached to the request
}

export interface ValidationSpec {
  rules?: ValidationRule[];
}

/** A registered, governed entity type — the resolved (parsed) form of a
 *  erp_change_request_entities row. */
export interface ChangeRequestEntity {
  entityKey: string;
  targetTable: string;
  idColumn: string;
  labelEn: string | null;
  labelAr: string | null;
  createPermission: string | null;
  approvePermission: string | null;
  workflowKey: string;              // resolved (defaults to `change_request:{entityKey}`)
  allowedFields: string[] | null;   // null → DFG governs which fields are changeable
  validation: ValidationSpec;
  attachmentTypes: string[];        // doc_key references into the doc-type registry
  supportsEffectiveDating: boolean;
  supportsBulk: boolean;
  bulkMax: number;
  notificationTemplate: string | null;
  isActive: boolean;
  companyId: string | null;         // null = global default; set = tenant override
}

/** The raw DB shape of an erp_change_request_entities row (snake_case, jsonb). */
export interface ChangeRequestEntityRow {
  company_id: string | null;
  entity_key: string;
  target_table: string;
  id_column: string | null;
  label_en: string | null;
  label_ar: string | null;
  create_permission: string | null;
  approve_permission: string | null;
  workflow_key: string | null;
  allowed_fields: unknown;
  validation: unknown;
  attachment_types: unknown;
  supports_effective_dating: boolean | null;
  supports_bulk: boolean | null;
  bulk_max: number | null;
  notification_template: string | null;
  is_active: boolean | null;
}

/** A doc-type registry row (resolved). */
export interface ChangeRequestDocType {
  docKey: string;
  labelEn: string | null;
  labelAr: string | null;
  isActive: boolean;
  companyId: string | null;
}

/** Outcome of an external approval adapter dispatch (PR 8 wires real adapters). */
export interface ApprovalAdapter {
  /** Push an approval request out to an external system (email/ERP/gov/API). */
  dispatch(input: { taskId: string; requestId: string; config: Record<string, unknown> }): Promise<void>;
}

/** A named field validator for bespoke rules referenced by ValidationRule.validator. */
export type NamedValidator = (value: unknown, ctx: { field: string; entityKey: string }) => string | null;
