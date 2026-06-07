// ============================================================================
// Search OS feature flags — all DEFAULT OFF (env-based, KAKO_* convention).
// When unset, the command palette behaves exactly as before (no search surface).
// ============================================================================

const on = (v: string | undefined): boolean => v === '1' || v === 'true';

/** V1: global search surface (index query + palette search mode). */
export const SEARCH_ENABLED = (): boolean => on(process.env.KAKO_SEARCH);

/** P2: event-driven incremental indexing (projector). Defined now, unused in V1. */
export const SEARCH_LIVE = (): boolean => on(process.env.KAKO_SEARCH_LIVE);

/** P3: fuzzy/typeahead + analytics UX polish. Defined now, unused in V1. */
export const SEARCH_UX = (): boolean => on(process.env.KAKO_SEARCH_UX);
