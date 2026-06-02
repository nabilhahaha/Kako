-- ============================================================================
-- 0108: Pilot hardening — Import access for sales leadership (walkthrough B1)
-- ----------------------------------------------------------------------------
-- The pilot walkthrough found that Sales Director / National Sales Manager could
-- not reach the Import wizard (gated `integrations.manage`, IT/Admin only),
-- blocking the "director imports customers" pilot journey. Grants
-- `integrations.manage` to those head-office sales roles so onboarding/migration
-- imports are self-service for sales leadership.
--
-- Separate migration (0107 is already applied on staging — migrations are
-- immutable once applied). ADDITIVE + idempotent. Mirrors the TS change. Held
-- from production.
-- ============================================================================

INSERT INTO erp_role_permissions (role_key, permission)
SELECT v.role_key, 'integrations.manage'
FROM (VALUES ('sales_director'), ('national_sales_manager')) AS v(role_key)
WHERE EXISTS (SELECT 1 FROM erp_roles r WHERE r.key = v.role_key)
ON CONFLICT (role_key, permission) DO NOTHING;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DELETE FROM erp_role_permissions
--  WHERE permission = 'integrations.manage'
--    AND role_key IN ('sales_director', 'national_sales_manager');
