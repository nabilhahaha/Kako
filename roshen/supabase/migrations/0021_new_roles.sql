-- =====================================================================
-- Roshen KSA — 0021 New role placeholders (additive, non-destructive)
-- Registers future roles. Full permissions are defined later; for now they
-- receive conservative navigation (Dashboard + Workspace only) via the app's
-- NAV_TREE gating, and NO broad write access — existing RLS is unchanged, so
-- these roles only see tasks/files explicitly shared or assigned to them.
-- =====================================================================
alter type app_role add value if not exists 'supply_chain_manager';
alter type app_role add value if not exists 'general_manager';
alter type app_role add value if not exists 'accountant';
