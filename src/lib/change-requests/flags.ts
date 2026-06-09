// Universal Change Request engine — feature flag. Platform master switch, default
// OFF. The engine is inert (tables exist but no surface is exposed) until a
// deployment sets KAKO_CHANGE_REQUESTS. See
// docs/architecture/platform/CHANGE-REQUEST-ENGINE-DESIGN.md.

const on = (v: string | undefined): boolean => v === '1' || v === 'true';

/** True when the Change Request platform capability is enabled (default OFF). */
export const CHANGE_REQUESTS_ENABLED = (): boolean => on(process.env.KAKO_CHANGE_REQUESTS);
