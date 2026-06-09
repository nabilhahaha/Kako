// Critical Alerts Framework — feature flag. Platform master switch, default OFF.
// The engine is inert (tables exist, evaluator + UI hidden) until KAKO_ALERTS.
// See docs/architecture/platform/CRITICAL-ALERTS-FRAMEWORK-DESIGN.md.

const on = (v: string | undefined): boolean => v === '1' || v === 'true';

/** True when the Critical Alerts platform capability is enabled (default OFF). */
export const ALERTS_ENABLED = (): boolean => on(process.env.KAKO_ALERTS);
