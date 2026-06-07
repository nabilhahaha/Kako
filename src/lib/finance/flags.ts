// Finance Foundation flag (Phase 1). Default OFF — the posting-rule engine and
// any GL posting are inert until enabled. Mirrors KAKO_EVENTS/KAKO_SEARCH.
const on = (v: string | undefined): boolean => v === '1' || v === 'true';

/** Finance Foundation master flag (default OFF). */
export const FINANCE_ENABLED = (): boolean => on(process.env.KAKO_FINANCE);
