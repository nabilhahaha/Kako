// Inventory costing flag (Phase 1). Default OFF — the costing layer computes
// valued cost (FIFO / Weighted-Average / Standard) and feeds the Finance engine
// (Augment model: engine posts COGS/inventory legs only). Mirrors KAKO_FINANCE.
const on = (v: string | undefined): boolean => v === '1' || v === 'true';

/** Inventory costing layer flag (default OFF). */
export const INVENTORY_COSTING_ENABLED = (): boolean => on(process.env.KAKO_INVENTORY_COSTING);
