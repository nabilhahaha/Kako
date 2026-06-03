-- ============================================================================
-- 0125: Authorization Phase 6 (P6) — Company Admins manage their own role
--                                    permissions (Authz Console write path)
-- ----------------------------------------------------------------------------
-- The Authorization Console lets a COMPANY ADMIN grant/revoke the finer
-- capabilities per role. Those writes target erp_company_role_permissions, whose
-- 0021 write policies were PLATFORM-OWNER-ONLY — so a company admin's grant would
-- be rejected by RLS. This widens the INSERT/UPDATE/DELETE policies to also allow
-- a company admin acting on THEIR OWN company (company_id = their company AND they
-- hold the admin role). Platform owner retains full access. Read policy unchanged.
--
-- Scope-safe: a company admin can only ever write rows for their own company
-- (company_id = erp_user_company_id()); they cannot touch another tenant's config.
-- Idempotent (DROP IF EXISTS + CREATE). No data change.
-- ============================================================================

DO $$
BEGIN
  -- INSERT: platform owner OR own-company admin.
  EXECUTE 'DROP POLICY IF EXISTS erp_company_role_permissions_ins ON erp_company_role_permissions';
  EXECUTE $p$
    CREATE POLICY erp_company_role_permissions_ins ON erp_company_role_permissions
      FOR INSERT WITH CHECK (
        erp_is_platform_owner()
        OR (company_id = erp_user_company_id() AND erp_is_company_admin(company_id))
      )
  $p$;

  -- UPDATE: platform owner OR own-company admin (both USING and WITH CHECK).
  EXECUTE 'DROP POLICY IF EXISTS erp_company_role_permissions_upd ON erp_company_role_permissions';
  EXECUTE $p$
    CREATE POLICY erp_company_role_permissions_upd ON erp_company_role_permissions
      FOR UPDATE
      USING (
        erp_is_platform_owner()
        OR (company_id = erp_user_company_id() AND erp_is_company_admin(company_id))
      )
      WITH CHECK (
        erp_is_platform_owner()
        OR (company_id = erp_user_company_id() AND erp_is_company_admin(company_id))
      )
  $p$;

  -- DELETE: platform owner OR own-company admin.
  EXECUTE 'DROP POLICY IF EXISTS erp_company_role_permissions_del ON erp_company_role_permissions';
  EXECUTE $p$
    CREATE POLICY erp_company_role_permissions_del ON erp_company_role_permissions
      FOR DELETE USING (
        erp_is_platform_owner()
        OR (company_id = erp_user_company_id() AND erp_is_company_admin(company_id))
      )
  $p$;
END $$;

-- ── Rollback (manual) ────────────────────────────────────────────────────────
-- Restore the 0021 platform-owner-only policies:
--   CREATE POLICY erp_company_role_permissions_ins ... WITH CHECK (erp_is_platform_owner());
--   CREATE POLICY erp_company_role_permissions_upd ... USING/CHECK (erp_is_platform_owner());
--   CREATE POLICY erp_company_role_permissions_del ... USING (erp_is_platform_owner());
