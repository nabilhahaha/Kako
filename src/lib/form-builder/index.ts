// ============================================================================
// Form Builder (Phase 8F) — public surface. No-code forms composed of typed
// fields, versioned (draft→publish), attachable to entities/workflow steps.
// Pure engine (no I/O), reusing the custom-field type vocabulary + the survey
// scoring model. Additive, flag-gated (KAKO_FORM_BUILDER, default OFF). Field
// access/visibility is resolved through the SINGLE field-governance path at
// render/apply time (no parallel field access) — wired in a later increment.
// ============================================================================

const on = (v: string | undefined): boolean => v === '1' || v === 'true';
const off = (v: string | undefined): boolean => v === '0' || v === 'false';

/**
 * Form Builder flag.
 *  - Explicit `KAKO_FORM_BUILDER=0`/`false` → OFF in any environment (KILL SWITCH —
 *    instant rollback with no code change).
 *  - Explicit `KAKO_FORM_BUILDER=1`/`true`  → ON in any environment (opt-in).
 *  - Otherwise: ON for deployed Vercel environments (production AND preview/staging);
 *    OFF for local/CI (VERCEL_ENV unset). Downstream the surface is still gated by the
 *    field_verification module + field_verification.admin permission, so reps never see it.
 */
export const FORM_BUILDER_ENABLED = (): boolean => {
  if (off(process.env.KAKO_FORM_BUILDER)) return false;
  if (on(process.env.KAKO_FORM_BUILDER)) return true;
  return process.env.VERCEL_ENV === 'production' || process.env.VERCEL_ENV === 'preview';
};

export * from './model';
export * from './governance';
export * from './scoring';
export * from './forms';
export * from './workflow-ref';
export * from './change-set';
export * from './submit-types';
