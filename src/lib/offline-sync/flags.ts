// Mobile Field App / offline-first module (Phase 7B) feature flag. Default OFF —
// the offline-sync engine (queue, conflict resolution, apply-plan) + device audit
// are additive and inert until enabled. The PWA shell + client store are the thin
// client layer over this engine.
const on = (v: string | undefined): boolean => v === '1' || v === 'true';

/** Mobile Field App / offline-sync flag (default OFF). */
export const MOBILE_ENABLED = (): boolean => on(process.env.KAKO_MOBILE);
