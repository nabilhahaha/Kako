// ============================================================================
// Form Builder — Dynamic Field Governance binding (Phase 8F-2). Pure.
//
// A form field may carry a `governanceKey` that binds it to the bound entity's
// governed field. Access (hidden/view/edit/required) is resolved ONCE through the
// SINGLE field-governance path (resolveLayout → Map<govKey, AccessLevel>) and
// passed in here as `gov`; this module never reads config itself, so there is no
// parallel field-access. An ungoverned field (no governanceKey, or no row) is
// 'edit' → the form behaves exactly as today.
// ============================================================================

import type { AccessLevel } from '@/lib/erp/field-governance';
import { allFields, isFieldVisible, type FormDefinition, type FormField, type FormAnswers } from './model';

/** Resolved access per governance key. Accepts the Map from resolveLayout or a
 *  serialized record (so the page can pass it to a client renderer). */
export type GovAccessMap = Record<string, AccessLevel> | Map<string, AccessLevel>;

function lookup(map: GovAccessMap, key: string | undefined): AccessLevel | undefined {
  if (!key) return undefined;
  return map instanceof Map ? map.get(key) : map[key];
}

/** Effective governed access for a form field. Ungoverned → 'edit'. Pure. */
export function fieldAccess(field: FormField, gov: GovAccessMap): AccessLevel {
  return lookup(gov, field.governanceKey) ?? 'edit';
}

export interface ResolvedFormField {
  field: FormField;
  access: AccessLevel;
  /** Rendered + validated only when conditionally visible AND not gov-'hidden'. */
  visible: boolean;
  /** access === 'view' → render read-only, never accept a submitted value. */
  readOnly: boolean;
  /** field.required OR gov-'required' (only meaningful while visible). */
  required: boolean;
}

/** Resolve every field for the current answers + governance. Pure. Honors BOTH
 *  conditional visibility (showWhen) and governance: a gov-'hidden' field is never
 *  shown, a 'view' field is read-only, a 'required' field is required even when the
 *  definition didn't mark it. */
export function resolveFormFields(def: FormDefinition, answers: FormAnswers, gov: GovAccessMap): ResolvedFormField[] {
  return allFields(def).map((field) => {
    const access = fieldAccess(field, gov);
    const visible = isFieldVisible(field, answers) && access !== 'hidden';
    return {
      field,
      access,
      visible,
      readOnly: access === 'view',
      required: visible && (Boolean(field.required) || access === 'required'),
    };
  });
}

/** Validate a response honoring conditional visibility AND governance: skips
 *  hidden/read-only fields, treats gov-'required' as required, and reuses the
 *  model's type/option checks. Returns problems (empty = OK). Pure. */
export function validateGovernedResponse(def: FormDefinition, answers: FormAnswers, gov: GovAccessMap): string[] {
  const problems: string[] = [];
  for (const r of resolveFormFields(def, answers, gov)) {
    if (!r.visible || r.readOnly) continue; // hidden or view → not the user's to fill
    const f = r.field;
    const v = answers[f.key];
    const empty = v == null || v === '';
    if (r.required && empty) { problems.push(`'${f.label || f.key}' is required`); continue; }
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

/** Build the answers that are SAFE to store: drop values for hidden/read-only
 *  fields (the user can't contribute them — no bypass) and report missing
 *  gov/required fields. The single governed write path for a form response. Pure. */
export function applyFormGovernance(
  def: FormDefinition,
  answers: FormAnswers,
  gov: GovAccessMap,
): { answers: FormAnswers; missingRequired: string[] } {
  const out: FormAnswers = {};
  const missingRequired: string[] = [];
  for (const r of resolveFormFields(def, answers, gov)) {
    if (!r.visible || r.readOnly) continue; // never persist a value the user couldn't set
    const v = answers[r.field.key];
    if (r.required && (v == null || v === '')) missingRequired.push(r.field.key);
    if (v !== undefined) out[r.field.key] = v;
  }
  return { answers: out, missingRequired };
}
