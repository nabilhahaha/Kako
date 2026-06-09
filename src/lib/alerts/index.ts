// Critical Alerts Framework — public surface. A platform-level, metadata-driven
// alert engine built on the existing notification, role-resolution, cron, event,
// and audit subsystems. Additive, flag-gated (KAKO_ALERTS, default OFF),
// multi-tenant, RLS-isolated. See
// docs/architecture/platform/CRITICAL-ALERTS-FRAMEWORK-DESIGN.md.

export * from './flags';
export * from './types';
export * from './registry';
