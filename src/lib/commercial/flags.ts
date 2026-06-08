// Commercial Excellence platform (Phase 7) feature flag. Default OFF — the
// pricing / credit / profitability / targets / forecasting / master-data-governance
// engines are additive and inert until enabled.
const on = (v: string | undefined): boolean => v === '1' || v === 'true';

/** Commercial Excellence platform flag (default OFF). */
export const COMMERCIAL_ENABLED = (): boolean => on(process.env.KAKO_COMMERCIAL);
