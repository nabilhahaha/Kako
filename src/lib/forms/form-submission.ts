// ============================================================================
// Multi-Form Field Work — submission validation (pure, no I/O / no React).
//
// Validates a rep's answers against a published FormSchema. Used both client-side (to gate
// the submit button) and server-side (the authoritative check in submitFormResponse). Mirrors
// the FV rule style: required visible fields, required photos, customer link, and the GPS lock.
// ============================================================================

import { visibleFields, isPhotoField, type FormSchema } from './form-schema';

export interface SubmissionInput {
  /** answers keyed by field id. Photo fields are NOT carried here (see photoIdsByField). */
  answers: Record<string, unknown>;
  /** chosen customer id, when the form is customer-linked. */
  customerId?: string | null;
  /** uploaded attachment ids keyed by photo field id. */
  photoIdsByField?: Record<string, string[]>;
  /** whether a GPS fix is available. */
  hasGps?: boolean;
}

export interface SubmissionError {
  /** field id, or 'customer' / 'gps' for form-level issues. */
  scope: string;
  code: 'required' | 'photo_required' | 'customer_required' | 'gps_required';
}

function isEmpty(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

/** Validate a submission against the published schema. Returns [] when it may be submitted. */
export function validateSubmission(schema: FormSchema, input: SubmissionInput): SubmissionError[] {
  const errors: SubmissionError[] = [];
  const photos = input.photoIdsByField ?? {};

  // form-level: customer link + GPS lock
  if (schema.settings.customerLink === 'required' && !input.customerId) {
    errors.push({ scope: 'customer', code: 'customer_required' });
  }
  if (schema.settings.requireGps && !input.hasGps) {
    errors.push({ scope: 'gps', code: 'gps_required' });
  }

  for (const f of visibleFields(schema)) {
    if (isPhotoField(f.type)) {
      const got = (photos[f.id] ?? []).filter(Boolean);
      if ((f.required || f.photoRequired) && got.length === 0) {
        errors.push({ scope: f.id, code: 'photo_required' });
      }
      continue;
    }
    if (f.required && isEmpty(input.answers[f.id])) {
      errors.push({ scope: f.id, code: 'required' });
    }
  }
  return errors;
}

/** Flatten all photo-field attachment ids into a single ordered list for erp_form_responses. */
export function buildResponsePhotoIds(schema: FormSchema, photoIdsByField: Record<string, string[]> | undefined): string[] {
  if (!photoIdsByField) return [];
  const out: string[] = [];
  for (const f of schema.fields) {
    if (!isPhotoField(f.type)) continue;
    for (const id of photoIdsByField[f.id] ?? []) if (id) out.push(id);
  }
  return out;
}

/** Keep only non-photo answers for fields that exist in the schema (drops stray keys). */
export function sanitizeAnswers(schema: FormSchema, answers: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of schema.fields) {
    if (isPhotoField(f.type)) continue;
    if (f.id in answers && !isEmpty(answers[f.id])) out[f.id] = answers[f.id];
  }
  return out;
}
