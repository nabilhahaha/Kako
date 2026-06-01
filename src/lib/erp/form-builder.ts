/** ── Dynamic Form & Workflow Builder — types (B1) ─────────────────────────
 *  Shape of form definitions / fields / submissions, mirroring the 0114 schema.
 *  Used by the designer UI (B2) and submission processing (B5). */

export const FIELD_TYPES = [
  'text', 'number', 'date', 'dropdown', 'multiselect',
  'attachment', 'image', 'gps', 'signature', 'section',
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export type FormStatus = 'draft' | 'active' | 'archived';
export type SubmissionStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

/** The whitelisted effect applied on approval (B6). Only the safest set is
 *  enabled; higher-risk business effects are deferred to a later phase. */
export type FormEffectType = 'record_only' | 'update_field' | 'set_gps' | 'create_customer';
export interface FormEffect {
  type: FormEffectType;
  table?: string;                  // update_field / set_gps target table
  column?: string;                 // update_field target column
  value_from?: string;             // update_field / set_gps source field key
  map?: Record<string, string>;    // create_customer: column → source field key
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
  default_value: string | null;
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
