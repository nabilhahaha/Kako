// ============================================================================
// Route Riding Excellence module (Phase 3 FMCG) — public surface. Additive,
// flag-gated (KAKO_ROUTE_RIDING, default OFF), multi-tenant safe, mobile/offline
// & audit-first, role-governance compatible. Pure engines (scoring/lifecycle/
// analytics) over additive schema (criteria config + rides/customers/evaluations/
// actions), reusing the visit/journey/GPS/scorecard/attachment surface. No
// hardcoded scores, no hardcoded FMCG rules — criteria + weights are company data.
// ============================================================================

export * from './flags';
export * from './types';
export * from './scoring';
export * from './lifecycle';
export * from './analytics';
