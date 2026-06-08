// ============================================================================
// Route Accounting & Van Operations (Phase 7A) — public surface. The operational
// foundation of van/route distribution: opening balance → load → sales →
// collections → returns → expenses → cash + inventory reconciliation → day close
// → route P&L, emitting the Van Statement / Day-Close / Cash-Recon / Inventory-
// Recon / Route-Profitability reports. Additive, flag-gated (KAKO_VAN_ACCOUNTING,
// default OFF), multi-tenant safe, audit-first, reuse-first. Reuses van load
// manifest (0194), van transfers (0133), van reconciliation (0138), day-close
// (0132), collections (0192), returns (0219).
// ============================================================================

export * from './flags';
export * from './cash';
export * from './inventory';
export * from './profitability';
export * from './statement';
