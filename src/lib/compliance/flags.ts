// E-Invoicing Compliance Platform (Phase 5F) feature flag. Default OFF — the
// compliance foundations (document model, hash chain, lifecycle, submission/retry
// queue, certificate store, provider registry) are additive and inert until
// enabled. Country packs + authority connectors gate separately (KAKO_TAX_<CC>);
// authority submission remains PAUSED pending credentials regardless of this flag.
const on = (v: string | undefined): boolean => v === '1' || v === 'true';

/** E-Invoicing Compliance platform flag (default OFF). */
export const EINVOICE_ENABLED = (): boolean => on(process.env.KAKO_EINVOICE);
