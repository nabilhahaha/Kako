// ============================================================================
// Form Builder (Phase 8F) — public surface. No-code forms composed of typed
// fields, versioned (draft→publish), attachable to entities/workflow steps.
// Pure engine (no I/O), reusing the custom-field type vocabulary + the survey
// scoring model. Additive, flag-gated (KAKO_FORM_BUILDER, default OFF). Field
// access/visibility is resolved through the SINGLE field-governance path at
// render/apply time (no parallel field access) — wired in a later increment.
// ============================================================================

const on = (v: string | undefined): boolean => v === '1' || v === 'true';

/** Form Builder flag (default OFF). */
export const FORM_BUILDER_ENABLED = (): boolean => on(process.env.KAKO_FORM_BUILDER);

export * from './model';
export * from './governance';
export * from './scoring';
export * from './forms';
export * from './workflow-ref';
export * from './change-set';
export * from './submit-types';
