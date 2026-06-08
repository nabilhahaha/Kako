// Customer Relationship Timeline module (Phase 3 FMCG) feature flag. Default OFF —
// the timeline (event index + health/360 read-models) is additive and inert until
// enabled. It is a business-history engine, not a notes field.
const on = (v: string | undefined): boolean => v === '1' || v === 'true';

/** Customer Timeline module flag (default OFF). */
export const CUSTOMER_TIMELINE_ENABLED = (): boolean => on(process.env.KAKO_CUSTOMER_TIMELINE);
