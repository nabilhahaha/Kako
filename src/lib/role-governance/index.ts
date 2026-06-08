// ============================================================================
// Dynamic Role Governance, Data Scope & Field Security Engine (Phase 7) — public
// surface. Enterprise dynamic permission/visibility/ownership/data-scope/field/
// action/approval framework. Each company controls exactly who can see, edit,
// approve, and export — without affecting any other company. Additive, flag-gated
// (KAKO_ROLE_GOVERNANCE, default OFF), multi-tenant safe, audit-first. Reuses the
// field-governance (0114), role permissions/overrides (0021/0125), ownership
// (0214), and role-template-versioning (0226) foundations.
// ============================================================================

const on = (v: string | undefined): boolean => v === '1' || v === 'true';

/** Dynamic Role Governance flag (default OFF). */
export const ROLE_GOVERNANCE_ENABLED = (): boolean => on(process.env.KAKO_ROLE_GOVERNANCE);

/** Temporary-access ENFORCEMENT flag (default OFF). When on, getUserContext unions
 *  a user's ACTIVE temporary grants (effective window + not expired) into their
 *  effective permissions — grant-only, company-isolated, audited. Independent of
 *  ROLE_GOVERNANCE so it can be piloted on its own. */
export const TEMP_ACCESS_ENFORCEMENT_ENABLED = (): boolean => on(process.env.KAKO_TEMP_ACCESS_ENFORCEMENT);

export * from './data-scope';
export * from './approval-authority';
export * from './security';
