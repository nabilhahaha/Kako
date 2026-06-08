// ============================================================================
// Entity 360 Platform (Phase 7) — public surface. A unified 360 capability for
// ANY entity (customer/product/category/brand/salesman/supervisor/area/region/
// route/promotion): one engine + a profile registry of panels sourced from
// existing read-models, filtered by role section security. Additive, flag-gated
// (KAKO_ENTITY360, default OFF), multi-tenant safe, audit-first, reuse-first.
// The generic entity timeline (erp_entity_timeline) generalizes the customer
// timeline to every entity type without redesign.
// ============================================================================

const on = (v: string | undefined): boolean => v === '1' || v === 'true';

/** Entity 360 platform flag (default OFF). */
export const ENTITY_360_ENABLED = (): boolean => on(process.env.KAKO_ENTITY360);

export * from './types';
export * from './registry';
export * from './build';
