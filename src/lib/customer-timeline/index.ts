// ============================================================================
// Customer Relationship Timeline (Phase 3 FMCG) — public surface. A permanent,
// immutable, searchable business-history engine (not a notes field): every
// significant customer event across all modules, with before/after, who/why,
// source module, related record, and attachment ref. Additive, flag-gated
// (KAKO_CUSTOMER_TIMELINE, default OFF), multi-tenant safe, audit-first. Reuses
// the ownership ledger (@/lib/ownership) + audit infra; references related records
// (no data duplication); never overwrites history (append-only via RLS).
// ============================================================================

export * from './flags';
export * from './catalog';
export * from './types';
export * from './feed';
export * from './health';
export * from './customer360';
