/** ── Dynamic Form & Workflow Builder — types (B1) ─────────────────────────
 *  Shape of form definitions / fields / submissions, mirroring the 0114 schema.
 *  Used by the designer UI (B2) and submission processing (B5). */

export const FIELD_TYPES = [
  'text', 'number', 'date', 'dropdown', 'multiselect',
  'attachment', 'image', 'gps', 'signature', 'section', 'entity_ref',
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

/** Referenceable entities for the entity_ref picker field. */
export const REF_ENTITIES = ['customer'] as const;
export type RefEntity = (typeof REF_ENTITIES)[number];

export type FormStatus = 'draft' | 'active' | 'archived';
export type SubmissionStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

/** The whitelisted effect applied on approval (B6). Only the safest set is
 *  enabled; higher-risk business effects are deferred to a later phase. */
export type FormEffectType = 'record_only' | 'update_field' | 'update_fields' | 'set_gps' | 'create_customer' | 'emit_fact';
export interface FormEffect {
  type: FormEffectType;
  table?: string;                  // update_field(s) / set_gps target table
  column?: string;                 // update_field target column
  value_from?: string;             // update_field / set_gps source field key
  map?: Record<string, string>;    // update_fields / create_customer / emit_fact: target ← source field key
  module?: string;                 // emit_fact: raw-fact module (e.g. field_ops)
  event?: string;                  // emit_fact: raw-fact event_type (e.g. fe_merchandising)
  [k: string]: unknown;
}

export interface FormField {
  id: string;
  form_id: string;
  key: string;
  label_ar: string | null;
  label_en: string | null;
  type: FieldType;
  section: string | null;
  sort_order: number;
  required: boolean;
  options: unknown | null;       // choices for dropdown / multiselect
  validation: unknown | null;    // min/max/length/regex/range
  visibility: unknown | null;    // conditional show/hide (workflow condition language)
  config: unknown | null;        // type-specific config (entity_ref → { entity })
  default_value: string | null;
}

/** Declarative subject resolution: where the form's subject customer comes from.
 *  Keeps owner-resolution (account_owner / route_owner) generic — the engine
 *  reads this instead of hard-coding form types.
 *    source 'record' → submission.record_id is the customer (bound forms)
 *    source 'field'  → submission.values[key] holds the customer id
 *    null            → defaults to 'record' (back-compat) */
export interface SubjectRef {
  entity?: string;                 // reserved for future subject entities (default 'customer')
  source: 'record' | 'field';
  key?: string;                    // field key when source = 'field'
}

export interface FormDefinition {
  id: string;
  company_id: string | null;     // null = global template
  key: string;
  name_ar: string | null;
  name_en: string | null;
  module: string | null;
  target_entity: string | null;
  workflow_key: string | null;
  effect: FormEffect;
  subject_ref: SubjectRef | null;
  status: FormStatus;
  version: number;
  is_latest: boolean;
}

export interface FormSubmission {
  id: string;
  company_id: string;
  form_id: string;
  record_id: string | null;
  submitter: string | null;
  values: Record<string, unknown>;
  status: SubmissionStatus;
  workflow_instance_id: string | null;
  created_at: string;
}
