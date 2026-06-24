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
 *  - Explicit `KAKO_FORM_BUILDER=1`/`true`  → ON in any environment (opt-in).
 *  - Explicit `KAKO_FORM_BUILDER=0`/`false` → OFF in any environment (kill switch).
 *  - Otherwise: ON for Vercel **preview** (staging) deployments only; OFF for
 *    production and local/CI. This enables staging retest without ever turning the
 *    feature on in production, and keeps the default OFF where VERCEL_ENV is unset.
 */
export const FORM_BUILDER_ENABLED = (): boolean => {
  if (on(process.env.KAKO_FORM_BUILDER)) return true;
  if (off(process.env.KAKO_FORM_BUILDER)) return false;
  return process.env.VERCEL_ENV === 'preview';
};

export * from './model';
export * from './governance';
export * from './scoring';
export * from './forms';
export * from './workflow-ref';
export * from './change-set';
export * from './submit-types';
