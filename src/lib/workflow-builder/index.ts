// ============================================================================
// Workflow Builder (Phase 8A) — public surface. A no-code BUILDER + reusable
// approval-template catalog over the EXISTING workflow engine (definitions/steps/
// runtime/tasks). Additive, flag-gated (KAKO_WORKFLOW_BUILDER, default OFF),
// multi-tenant safe, audit-first. Templates are self-contained {entity, trigger,
// steps[]} the engine understands; a tenant clones a template into its own
// erp_workflow_definitions/_steps (cloning lands in a later increment).
// ============================================================================

const on = (v: string | undefined): boolean => v === '1' || v === 'true';

/** Workflow Builder flag (default OFF). */
export const WORKFLOW_BUILDER_ENABLED = (): boolean => on(process.env.KAKO_WORKFLOW_BUILDER);

export * from './templates';
