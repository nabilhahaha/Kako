// ============================================================================
// Van Sales Mobile Control (Phase A) — public surface. A mobile-first salesman
// capability built ON the existing VANTORA engines (workflow, form-builder,
// field-governance, notifications, audit, offline-sync, pricing, collections,
// van-accounting). Additive, flag-gated (KAKO_VAN_SALES, default OFF),
// multi-tenant, role-based, offline-aware, audited. See
// docs/architecture/platform/VAN-SALES-MOBILE-CONTROL-DESIGN.md.
// ============================================================================

const on = (v: string | undefined): boolean => v === '1' || v === 'true';

/** Van Sales flag (default OFF). The module is inert until a tenant enables it. */
export const VAN_SALES_ENABLED = (): boolean => on(process.env.KAKO_VAN_SALES);

export * from './day';
export * from './load';
export * from './reports';
export * from './sell';
