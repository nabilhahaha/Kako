// Module & Feature Entitlement Engine — feature flag. Platform master switch,
// default OFF. While OFF the gate equals hasPermission exactly (zero behavior
// change). See docs/architecture/platform/ENTITLEMENT-ENGINE-DESIGN.md.

const on = (v: string | undefined): boolean => v === '1' || v === 'true';

/** True when the entitlement layer is enabled (default OFF). */
export const ENTITLEMENTS_ENABLED = (): boolean => on(process.env.KAKO_ENTITLEMENTS);
