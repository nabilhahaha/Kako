// ============================================================================
// Enterprise Returns & Credit Note Engine (Phase 4+) — public surface. Returns
// preserve the commercial reality of the original sale: promotions, free goods,
// discounts, trade spend, incentives, commissions are reversed PROPORTIONALLY.
// Additive, flag-gated (KAKO_RETURNS, default OFF), multi-tenant safe, audit-first,
// Workflow-OS compatible. Reuses the promotion reversal engines + existing
// returns/reason tables. Fully company-configurable (no hardcoding).
// ============================================================================

export * from './flags';
export * from './policy';
export * from './reconciliation';
export * from './validation';
export * from './credit-note';
export * from './analytics';
