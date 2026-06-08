// ============================================================================
// Suggested Load & Demand Engine (Phase 7E) — public surface. The final Phase-7
// item: forecast-based van loading. Projects per-route SKU demand (reusing the
// Phase-6B forecasting engine), suggests the van load + replenishment, and reports
// van utilization vs capacity. Additive, flag-gated (KAKO_SUGGESTED_LOAD, default
// OFF), multi-tenant safe, reuse-first. Reuses forecasting (6B), van load manifest
// (0194), journey plans (0129). Persisted in erp_suggested_loads(+lines).
// ============================================================================

export * from './flags';
export * from './demand';
export * from './load';
