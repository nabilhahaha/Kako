-- ============================================================================
-- 0307: FMCG Salesman role model becomes the DEFAULT for new companies
-- ----------------------------------------------------------------------------
-- Promotes the validated Van-Sales-canonical salesman model to the role template.
-- The salesman role (used by the FMCG business types: fmcg / general / wholesale)
-- should no longer carry back-office / master-data permissions, so a NEW company
-- inherits the correct field model from day one:
--   Customer → Statement → Collect → Sell → Invoice → Print  (no manual cleanup).
--
-- HOW NEW COMPANIES INHERIT IT: erp_seed_company_roles() (0022) copies
-- erp_role_permissions → erp_company_role_permissions at company creation. So
-- removing these 3 perms from the TEMPLATE flows to every new company automatically.
--
-- EXISTING COMPANIES ARE UNCHANGED: seeding is a snapshot taken at creation; every
-- existing tenant already has its own erp_company_role_permissions and the auth
-- resolver treats that company config as authoritative (the template is only a
-- fallback for companies with NO config — there are none). An existing company is
-- migrated ONLY by an explicit call to erp_apply_fmcg_salesman_default() below.
--
-- ADDITIVE + idempotent. No schema change. Rollback at the bottom.
-- ============================================================================

-- 1) Template change → applies to NEW companies via erp_seed_company_roles().
DELETE FROM erp_role_permissions
 WHERE role_key = 'salesman'
   AND permission IN ('sales.sell', 'customers.manage', 'customer.create');

-- 2) Explicit per-company migrator (Platform Owner only) — lets us CHOOSE which
--    existing FMCG companies adopt the new default. Removes ONLY the 3 back-office
--    permissions from that company's salesman role; every other permission and any
--    company-specific override is left intact. Reversible (re-add the rows).
CREATE OR REPLACE FUNCTION erp_apply_fmcg_salesman_default(p_company_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_removed integer;
BEGIN
  IF NOT erp_is_platform_owner() THEN RAISE EXCEPTION 'not_platform_owner'; END IF;
  DELETE FROM erp_company_role_permissions
   WHERE company_id = p_company_id
     AND role_key = 'salesman'
     AND permission IN ('sales.sell', 'customers.manage', 'customer.create');
  GET DIAGNOSTICS v_removed = ROW_COUNT;
  RETURN v_removed;
END $$;

REVOKE EXECUTE ON FUNCTION erp_apply_fmcg_salesman_default(uuid) FROM anon;

-- ── Rollback ────────────────────────────────────────────────────────────────
-- Restore the template (new companies revert to the old model):
--   INSERT INTO erp_role_permissions (role_key, permission) VALUES
--     ('salesman','sales.sell'), ('salesman','customers.manage'), ('salesman','customer.create')
--   ON CONFLICT DO NOTHING;
-- And DROP FUNCTION erp_apply_fmcg_salesman_default(uuid);
