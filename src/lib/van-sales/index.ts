// ============================================================================
// Van Sales Mobile Control (Phase A) — public surface. A mobile-first salesman
// capability built ON the existing VANTORA engines (workflow, form-builder,
// field-governance, notifications, audit, offline-sync, pricing, collections,
// van-accounting). Additive, flag-gated (KAKO_VAN_SALES, default OFF),
// multi-tenant, role-based, offline-aware, audited. See
// docs/architecture/platform/VAN-SALES-MOBILE-CONTROL-DESIGN.md.
// ============================================================================

/**
 * Van Sales platform switch. Now GA: ON unless EXPLICITLY disabled
 * (KAKO_VAN_SALES = 0 | false | off). This is only the platform master switch —
 * actual per-tenant access is still gated by erp_van_sales_settings.is_enabled
 * (default OFF, set by a company admin) AND the company's `van_sales` module,
 * so enabling this default does not turn van-sales on for any tenant that has
 * not explicitly opted in. Set KAKO_VAN_SALES=0 to kill the feature globally.
 */
export const VAN_SALES_ENABLED = (): boolean => {
  const v = (process.env.KAKO_VAN_SALES ?? '').trim().toLowerCase();
  return v !== '0' && v !== 'false' && v !== 'off';
};

export * from './day';
export * from './load';
export * from './reports';
export * from './sell';
export * from './returns';
