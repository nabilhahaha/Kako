// ============================================================================
// Role Template Versioning & Override Policy (Phase 7) — public surface.
// MANDATORY platform-wide policy: platform templates are versioned defaults;
// companies own independent copies; company customizations affect only themselves;
// template changes affect only future companies unless an EXPLICIT upgrade is
// requested; and overrides survive upgrades. Additive, flag-gated
// (KAKO_ROLE_VERSIONING, default OFF), multi-tenant safe, audit-first.
// ============================================================================

const on = (v: string | undefined): boolean => v === '1' || v === 'true';

/** Role template versioning flag (default OFF). */
export const ROLE_VERSIONING_ENABLED = (): boolean => on(process.env.KAKO_ROLE_VERSIONING);

export * from './versioning';
export * from './upgrade';
