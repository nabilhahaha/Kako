// ============================================================================
// Form Builder — workflow-step ↔ form reference (Phase 8F-2). Pure.
//
// A workflow step can REFERENCE a form by storing { form_code (, form_version) }
// in its existing `config: Record<string, unknown>` bag — no new step_type, no
// engine change. The engine ignores unknown config keys; the form layer reads the
// reference (this module) to render/attach the form for that step (e.g. an
// approval step that reviews responses to a customer-data-update form).
// ============================================================================

export interface FormStepRef {
  formCode: string;
  formVersion?: number;
}

/** The config fragment that references a form. Merge into a step's config —
 *  additive, so it never disturbs the step's existing behaviour. Pure. */
export function buildFormStepConfig(ref: FormStepRef): Record<string, unknown> {
  return { form_code: ref.formCode, ...(ref.formVersion != null ? { form_version: ref.formVersion } : {}) };
}

/** Read a form reference from a step config, or null when none. Pure. */
export function readFormStepRef(config: Record<string, unknown> | null | undefined): FormStepRef | null {
  const code = config?.form_code;
  if (typeof code !== 'string' || !code) return null;
  const v = config?.form_version;
  return { formCode: code, formVersion: typeof v === 'number' ? v : undefined };
}

/** True when a step config references a form. Pure. */
export function hasFormReference(config: Record<string, unknown> | null | undefined): boolean {
  return readFormStepRef(config) !== null;
}
