// Universal Integration Hub (Phase 6) feature flag. Default OFF — the hub
// formalization, mapping engine, monitoring, marketplace, and new connectors are
// additive and inert until enabled. Per-connector flags gate individual adapters.
// Mirrors KAKO_FINANCE / KAKO_TAX.
const on = (v: string | undefined): boolean => v === '1' || v === 'true';

/** Universal Integration Hub flag (default OFF). */
export const INTEGRATION_HUB_ENABLED = (): boolean => on(process.env.KAKO_INTEGRATION_HUB);
