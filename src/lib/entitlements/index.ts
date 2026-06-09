// Module & Feature Entitlement Engine — public surface. A platform-level,
// metadata-driven entitlement layer (Platform Owner → Company Admin → User) built
// ADDITIVELY on the existing module/RBAC/audit infrastructure. Flag-gated
// (KAKO_ENTITLEMENTS, default OFF); while OFF the gate equals hasPermission. No
// existing auth/RLS behavior is changed. See
// docs/architecture/platform/ENTITLEMENT-ENGINE-DESIGN.md.

export * from './flags';
export * from './types';
export * from './registry';
