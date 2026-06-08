// Enterprise Returns & Credit Note module (Phase 4+) feature flag. Default OFF —
// the engine (policy/reconciliation/credit-notes/analytics) is additive and inert
// until enabled. Reuses the promotion reversal engines + existing returns tables.
const on = (v: string | undefined): boolean => v === '1' || v === 'true';

/** Enterprise Returns module flag (default OFF). */
export const RETURNS_ENABLED = (): boolean => on(process.env.KAKO_RETURNS);
