-- ============================================================================
-- 0150: Plan storage-limit entitlement (Plans & Modules editor)
-- ----------------------------------------------------------------------------
-- Adds a nullable `storage_limit_mb` to erp_plans so the platform Plans editor can
-- manage a per-plan storage cap alongside max_users / max_branches / max_products.
-- NULL = unlimited (consistent with the other limit columns). Additive + safe.
-- Rollback: ALTER TABLE erp_plans DROP COLUMN storage_limit_mb;
-- ============================================================================

ALTER TABLE erp_plans ADD COLUMN IF NOT EXISTS storage_limit_mb INTEGER;

COMMENT ON COLUMN erp_plans.storage_limit_mb IS 'Per-plan storage cap in MB; NULL = unlimited.';
