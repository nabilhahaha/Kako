-- 0347: Role Permission Overrides (Bulk Role Overrides). Extends the SAME engine
-- (erp_temporary_access_grants) with role-level overrides — no new engine, no
-- duplicate tables. Additive + non-breaking. Reuses the delegable allowlist, the
-- immutable deny-list (erp_is_delegable_permission), admin-gated RLS, audit, and
-- the entitlement engine. Default-OFF (resolver gated by
-- KAKO_ROLE_PERMISSION_OVERRIDES AND per-company entitlement
-- platform.role_permission_overrides).
--
-- Resolution order: base role perms -> ROLE overrides -> USER overrides ->
-- effective. User-level overrides win (applied last in the resolver).

-- Role rows are keyed by role_key (not a user). user_id is widened to nullable.
ALTER TABLE erp_temporary_access_grants ADD COLUMN IF NOT EXISTS role_key text;
ALTER TABLE erp_temporary_access_grants ALTER COLUMN user_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_role_override
  ON erp_temporary_access_grants (company_id, role_key, kind);

-- At most one role override per (company, role, permission). Partial to
-- kind='role_override' so user/temporary rows are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS uq_role_override_key
  ON erp_temporary_access_grants (company_id, role_key, grant_key)
  WHERE kind = 'role_override';

DO $$
BEGIN
  -- Extend kind to include 'role_override'.
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='erp_tag_kind_chk') THEN
    ALTER TABLE erp_temporary_access_grants DROP CONSTRAINT erp_tag_kind_chk;
  END IF;
  ALTER TABLE erp_temporary_access_grants
    ADD CONSTRAINT erp_tag_kind_chk CHECK (kind IN ('temporary','override','role_override'));

  -- Subject shape: role rows -> role_key set + user_id null; everything else ->
  -- user_id set. Existing temporary/override rows (user_id set, role_key null)
  -- satisfy this unchanged.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='erp_tag_subject_chk') THEN
    ALTER TABLE erp_temporary_access_grants ADD CONSTRAINT erp_tag_subject_chk CHECK (
      (kind = 'role_override' AND role_key IS NOT NULL AND user_id IS NULL)
      OR (kind <> 'role_override' AND user_id IS NOT NULL)
    );
  END IF;

  -- Mandatory reason for BOTH override and role_override (never legacy temporary).
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='erp_tag_override_reason_chk') THEN
    ALTER TABLE erp_temporary_access_grants DROP CONSTRAINT erp_tag_override_reason_chk;
  END IF;
  ALTER TABLE erp_temporary_access_grants ADD CONSTRAINT erp_tag_override_reason_chk CHECK (
    kind NOT IN ('override','role_override') OR (reason IS NOT NULL AND length(btrim(reason)) > 0)
  );
END $$;

-- Tighten the write RLS so role_override rows are ALSO delegability-checked
-- (the 0346 policies only checked kind='override'). Admin gating unchanged.
DROP POLICY IF EXISTS erp_uao_insert ON erp_temporary_access_grants;
CREATE POLICY erp_uao_insert ON erp_temporary_access_grants FOR INSERT
  WITH CHECK (
    (erp_is_platform_owner() OR erp_is_super_admin()
      OR (company_id = erp_user_company_id() AND erp_is_company_admin(company_id)))
    AND (kind NOT IN ('override','role_override') OR erp_is_delegable_permission(grant_key, company_id))
  );

DROP POLICY IF EXISTS erp_uao_update ON erp_temporary_access_grants;
CREATE POLICY erp_uao_update ON erp_temporary_access_grants FOR UPDATE
  USING (erp_is_platform_owner() OR erp_is_super_admin()
      OR (company_id = erp_user_company_id() AND erp_is_company_admin(company_id)))
  WITH CHECK (
    (erp_is_platform_owner() OR erp_is_super_admin()
      OR (company_id = erp_user_company_id() AND erp_is_company_admin(company_id)))
    AND (kind NOT IN ('override','role_override') OR erp_is_delegable_permission(grant_key, company_id))
  );

-- Rollback (manual): restore the 0346 policies (kind <> 'override'); drop
-- uq_role_override_key / idx_role_override; drop erp_tag_subject_chk; restore
-- erp_tag_kind_chk to ('temporary','override') and the reason check to override
-- only; ALTER COLUMN user_id SET NOT NULL (after clearing role rows); DROP COLUMN role_key.
