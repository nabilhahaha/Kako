// ============================================================================
// Route Optimization & Territory Planning module (Phase 3 FMCG) — public surface.
// An enterprise FMCG route-intelligence engine (not a customer scheduler):
// frequency rules → journey generation → sequence optimization → balancing →
// territory management → specialized (collection/van/merch/riding) routes → AI
// recommendations → dashboards. Additive, flag-gated (KAKO_ROUTE_OPTIMIZATION,
// default OFF), multi-tenant safe, mobile/offline & audit-first. Reuses existing
// customer GPS, journey-sort, journey plans, and visits; no vendor lock-in; no
// hardcoded frequencies. Territory ownership history via @/lib/ownership.
// ============================================================================

export * from './flags';
export * from './frequency';
export * from './optimize';
export * from './balancing';
export * from './territory';
export * from './maps';
export * from './route-types';
export * from './generator';
export * from './recommendations';
export * from './analytics';
