// ============================================================================
// Form Builder — pure model + validation + conditional visibility (Phase 8F-1).
// Reuses the custom-field type vocabulary. No I/O. The stored schema (jsonb) is a
// FormDefinition; the renderer + governance binding live in later increments.
// ============================================================================

import type { CustomFieldType } from '@/lib/erp/custom-fields';

/** A dynamic option source for select/multiselect — resolved SERVER-SIDE into
 *  `options` before render (per-tenant master data; keeps the engine pure + the
 *  field a governed select). One of `lookup` (erp_customer_lookups.kind) or
 *  `table` (a master table like erp_routes). */
export interface FormOptionSource {
  lookup?: 'segment' | 'classification' | 'channel';
  table?: string;
}

/** A field in a form (typed; reuses CustomFieldType + a yes/no + rating for parity
 *  with surveys). `governanceKey` binds to the field-governance layer at render. */
export interface FormField {
  key: string;
  label: string;
  labelAr?: string;
  type: CustomFieldType | 'yesno' | 'rating';
  required?: boolean;
  options?: { value: string; label?: string; labelAr?: string }[];
  /** Dynamic master-data options resolved server-side (FMCG classification /
   *  channel / segment / route). Mutually exclusive with static `options`. */
  optionsSource?: FormOptionSource;
  max?: number;                    // rating/number cap
  governanceKey?: string;          // resolves through field-governance (no bypass)
  // Conditional visibility: show this field only when another field matches.
  showWhen?: { field: string; equals: unknown };
}

export interface FormSection { key: string; title: string; titleAr?: string; fields: FormField[] }

/** Optional workflow binding: on submit (online OR offline-on-sync), open a change
 *  request on the workflow subject table and emit a domain event that auto-starts
 *  the bound workflow. Generic — any entity with a change-request table (customer/
 *  supplier/product/route) declares one; the single submit path honors it. */
export interface FormWorkflowBinding {
  /** Change-request table (the workflow subject). Convention: columns
   *  {<targetIdField>, changes jsonb, reason, requested_by, status}. */
  changeRequestTable: string;
  /** Column on the change request holding the target record id (e.g. customer_id). */
  targetIdField: string;
  /** Entity of the workflow subject (event + dispatcher match). */
  changeEntity: string;
  /** Domain event emitted on submit (drives auto-start). */
  eventType: string;
  /** Answer field carrying the human reason (+ `<field>_detail`). Default 'reason'. */
  reasonField?: string;
}

export interface FormDefinition { sections: FormSection[]; workflow?: FormWorkflowBinding }

export type FormAnswers = Record<string, unknown>;

/** All fields across sections, in order. Pure. */
export function allFields(def: FormDefinition): FormField[] {
  return def.sections.flatMap((s) => s.fields);
}

/** Whether a field is visible given current answers (conditional logic). Pure. */
export function isFieldVisible(field: FormField, answers: FormAnswers): boolean {
  if (!field.showWhen) return true;
  return answers[field.showWhen.field] === field.showWhen.equals;
}

/** Validate a form DEFINITION is well-formed (unique keys, options for selects,
 *  showWhen references an existing earlier field). Returns problems (empty = OK). Pure. */
export function validateFormDefinition(def: FormDefinition): string[] {
  const problems: string[] = [];
  if (!def.sections || def.sections.length === 0) problems.push('form has no sections');
  const keys = new Set<string>();
  for (const f of allFields(def)) {
    if (!f.key) problems.push('field with empty key');
    if (keys.has(f.key)) problems.push(`duplicate field key '${f.key}'`);
    keys.add(f.key);
    if ((f.type === 'select' || f.type === 'multiselect') && (!f.options || f.options.length === 0) && !f.optionsSource) {
      problems.push(`field '${f.key}' (${f.type}) requires options`);
    }
  }
  // showWhen must reference a known field (and not itself).
  for (const f of allFields(def)) {
    if (f.showWhen && (f.showWhen.field === f.key || !keys.has(f.showWhen.field))) {
      problems.push(`field '${f.key}' showWhen references unknown/self field '${f.showWhen.field}'`);
    }
  }
  return problems;
}

/** Validate a RESPONSE against a definition: required + type, honoring conditional
 *  visibility (a hidden field is not required). Returns problems (empty = OK). Pure. */
export function validateFormResponse(def: FormDefinition, answers: FormAnswers): string[] {
  const problems: string[] = [];
  for (const f of allFields(def)) {
    if (!isFieldVisible(f, answers)) continue;          // hidden → skip
    const v = answers[f.key];
    const empty = v == null || v === '';
    if (f.required && empty) { problems.push(`'${f.label || f.key}' is required`); continue; }
    if (empty) continue;
    if ((f.type === 'number' || f.type === 'rating') && typeof v !== 'number' && Number.isNaN(Number(v))) {
      problems.push(`'${f.label || f.key}' must be a number`);
    }
    if (f.type === 'select' && f.options && !f.options.some((o) => o.value === v)) {
      problems.push(`'${f.label || f.key}' has an invalid option`);
    }
  }
  return problems;
}
