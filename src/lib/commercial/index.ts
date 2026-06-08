// ============================================================================
// Commercial Excellence platform (Phase 7) — public surface (6A: pricing / credit
// / profitability). Transforms VANTORA into a Commercial Decision Platform.
// Additive, flag-gated (KAKO_COMMERCIAL, default OFF), multi-tenant safe,
// audit-first, effective-dated, reuse-first. Pure engines over additive config +
// snapshot schema; extends existing pricing (0106) + credit (0026/0141) + targets.
// ============================================================================

export * from './flags';
export * from './pricing/engine';
export * from './credit/engine';
export * from './profitability/engine';
