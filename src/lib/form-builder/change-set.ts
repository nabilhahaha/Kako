// ============================================================================
// Form Builder — change-set extraction (Phase 8F-2). Pure. Projects a form's
// answers down to the entity-backed (governed) field values — the proposed
// changes that become a customer change request's `changes` jsonb and feed the
// workflow. Form-meta fields (reason, attachments, conditional helpers) carry no
// governanceKey and are excluded.
// ============================================================================

import { allFields, type FormDefinition, type FormAnswers } from './model';

const isEmpty = (v: unknown): boolean => v === undefined || v === null || v === '';

/** The governed after-values keyed by their entity column (governanceKey). Pure.
 *  Only non-empty, governance-bound fields present in the answers are included. */
export function extractChangeSet(def: FormDefinition, answers: FormAnswers): FormAnswers {
  const out: FormAnswers = {};
  for (const f of allFields(def)) {
    if (f.governanceKey && f.key in answers && !isEmpty(answers[f.key])) {
      out[f.governanceKey] = answers[f.key];
    }
  }
  return out;
}

/** True when the answers propose at least one entity-backed change. Pure. */
export function hasChanges(def: FormDefinition, answers: FormAnswers): boolean {
  return Object.keys(extractChangeSet(def, answers)).length > 0;
}
