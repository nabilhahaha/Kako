// Universal Change Request engine — public surface. A reusable, metadata-driven
// platform capability that governs changes to any master-data entity through an
// audited, approved request flow, WITHOUT engine code per entity. Built on the
// existing workflow, event, DFG, audit, notification, permission, and attachment
// subsystems. Additive, flag-gated (KAKO_CHANGE_REQUESTS, default OFF),
// multi-tenant, RLS-isolated. See
// docs/architecture/platform/CHANGE-REQUEST-ENGINE-DESIGN.md.

export * from './flags';
export * from './types';
export * from './registry';
