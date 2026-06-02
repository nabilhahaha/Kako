-- ============================================================================
-- 0107: Pilot hardening — pricing/master-data permissions for sales leadership
-- ----------------------------------------------------------------------------
-- Closes a Pilot Readiness gap: no FMCG sales-leadership role could reach
-- Sales → Pricing (pricing.manage) or Settings → Customer Data
-- (settings.custom_fields) — only admin/super-admin. Grants both to the
-- head-office sales roles (Sales Director, National Sales Manager) so pilot
-- pricing + customer master-data are self-service.
--
-- ADDITIVE + idempotent (global role defaults; per-company overrides untouched).
-- Mirrors the TS ROLE_PERMISSIONS change. Held from production.
-- ============================================================================

INSERT INTO erp_role_permissions (role_key, permission)
SELECT v.role_key, v.permission
FROM (VALUES
  ('sales_director',         'pricing.manage'),
  ('sales_director',         'settings.custom_fields'),
  ('national_sales_manager', 'pricing.manage'),
  ('national_sales_manager', 'settings.custom_fields')
) AS v(role_key, permission)
WHERE EXISTS (SELECT 1 FROM erp_roles r WHERE r.key = v.role_key)
ON CONFLICT (role_key, permission) DO NOTHING;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- DELETE FROM erp_role_permissions
--  WHERE (role_key, permission) IN (
--    ('sales_director','pricing.manage'), ('sales_director','settings.custom_fields'),
--    ('national_sales_manager','pricing.manage'), ('national_sales_manager','settings.custom_fields')
--  );
