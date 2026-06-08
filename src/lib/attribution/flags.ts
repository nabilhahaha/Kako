// Commercial Attribution & Traceability module (Phase 4+) feature flag. Default
// OFF — the explanation/traceability layer is additive and inert until enabled.
const on = (v: string | undefined): boolean => v === '1' || v === 'true';

/** Commercial Attribution & Traceability flag (default OFF). */
export const ATTRIBUTION_ENABLED = (): boolean => on(process.env.KAKO_ATTRIBUTION);
