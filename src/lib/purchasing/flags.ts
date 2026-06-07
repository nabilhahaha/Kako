// Purchasing (Phase 2) feature flags. Default OFF — the supplier-invoice / 3-way
// match / AP layer is additive and inert until deliberately enabled. Mirrors the
// KAKO_FINANCE / KAKO_INVENTORY_COSTING convention.
const on = (v: string | undefined): boolean => v === '1' || v === 'true';

/** Purchasing AP layer (supplier invoices, 3-way match) flag (default OFF). */
export const PURCHASING_ENABLED = (): boolean => on(process.env.KAKO_PURCHASING);
