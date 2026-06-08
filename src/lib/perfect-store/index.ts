// ============================================================================
// Perfect Store Engine (Phase 7C) — public surface. A configurable, channel/
// region/customer-type-aware perfect-store scoring layer over the existing pillar
// scorer, with snapshots, leaderboards, and trends. Additive, flag-gated
// (KAKO_PERFECT_STORE, default OFF), multi-tenant safe, reuse-first. Reuses
// perfect-store pillars/banding, MSL (0144), OOS/assortment, distribution KPIs,
// outlet grading (0145), surveys.
// ============================================================================

export * from './flags';
export * from './scorecard';
export * from './analytics';
