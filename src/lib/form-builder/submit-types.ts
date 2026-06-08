// ============================================================================
// Form Builder — submission contract types (Phase 8F-2). Pure types only, kept
// out of the 'use server' action module (which may export async functions only)
// so the server action, the offline-sync route handler, and the client can all
// share one shape.
// ============================================================================

import type { FormAnswers } from './model';

/** Submit a response to a form, by id or by (global/company) code. */
export interface SubmitFormInput {
  formId?: string;
  formCode?: string;
  answers: FormAnswers;
  /** Override the form's bound entity (governance + linkage). Defaults to the form's. */
  entity?: string;
  /** The record this response is about (e.g. the customer id). */
  recordId?: string;
}

export interface SubmitFormResult {
  ok: boolean;
  error?: string;
  /** erp_form_responses.id on success. */
  id?: string;
  /** Field-level validation problems (when error === 'validation'). */
  problems?: string[];
}
