-- 0346: User Access Overrides — generalize the existing per-user access-grant
-- engine (erp_temporary_access_grants) into one backward-compatible override
-- path. ADDITIVE + NON-BREAKING:
--   * existing temporary grants keep working EXACTLY as today (kind='temporary',
--     effect='grant', dated windows);
--   * a new 'override' kind adds permanent grant/revoke, gated by a platform-
--     owner delegability allowlist + an immutable deny-list (DB belt), and
--     admin-gated writes (UI -> action -> RLS WITH CHECK -> audit).
-- No tenant-isolation changes. RLS changes are confined to THIS table's write
-- path (reads stay tenant-scoped, exactly as before). Default-OFF: the resolver
-- block is gated by KAKO_USER_ACCESS_OVERRIDES (env), so these objects are inert
-- until explicitly enabled.

-- ── E0: additive columns on the existing table ──────────────────────────────
ALTER TABLE erp_temporary_access_grants
  ADD COLUMN IF NOT EXISTS effect text NOT NULL DEFAULT 'grant',
  ADD COLUMN IF NOT EXISTS kind   text NOT NULL DEFAULT 'temporary';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'erp_tag_effect_chk') THEN
    ALTER TABLE erp_temporary_access_grants
      ADD CONSTRAINT erp_tag_effect_chk CHECK (effect IN ('grant','revoke'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'erp_tag_kind_chk') THEN
    ALTER TABLE erp_temporary_access_grants
      ADD CONSTRAINT erp_tag_kind_chk CHECK (kind IN ('temporary','override'));
  END IF;
  -- Reason is mandatory for the NEW override path only — never retroactively on
  -- legacy temporary rows (all existing rows are kind='temporary').
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'erp_tag_override_reason_chk') THEN
    ALTER TABLE erp_temporary_access_grants
      ADD CONSTRAINT erp_tag_override_reason_chk
      CHECK (kind <> 'override' OR (reason IS NOT NULL AND length(btrim(reason)) > 0));
  END IF;
END $$;

-- Permanent overrides: a NULL window means "no time bound". Widening only —
-- existing inserts that still supply both timestamps continue to work.
ALTER TABLE erp_temporary_access_grants ALTER COLUMN effective_from DROP NOT NULL;
ALTER TABLE erp_temporary_access_grants ALTER COLUMN effective_to   DROP NOT NULL;

-- Override lookups are by (company, user, kind).
CREATE INDEX IF NOT EXISTS idx_temp_access_override
  ON erp_temporary_access_grants (company_id, user_id, kind);

-- ── E1: platform-owner delegability allowlist ───────────────────────────────
CREATE TABLE IF NOT EXISTS erp_delegable_permissions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permission  text NOT NULL,
  company_id  uuid NULL REFERENCES erp_companies(id) ON DELETE CASCADE,  -- NULL = global default
  enabled     boolean NOT NULL DEFAULT true,
  updated_by  uuid,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
-- One row per (scope, permission); global scope normalized via a sentinel uuid.
CREATE UNIQUE INDEX IF NOT EXISTS uq_delegable_perm
  ON erp_delegable_permissions (COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid), permission);

ALTER TABLE erp_delegable_permissions ENABLE ROW LEVEL SECURITY;
-- Read: tenant-scoped (global rows + own-company rows). Write: platform-owner / super-admin only.
DROP POLICY IF EXISTS erp_delegable_read ON erp_delegable_permissions;
CREATE POLICY erp_delegable_read ON erp_delegable_permissions FOR SELECT
  USING (company_id IS NULL OR company_id = erp_user_company_id() OR erp_is_platform_owner());
DROP POLICY IF EXISTS erp_delegable_write ON erp_delegable_permissions;
CREATE POLICY erp_delegable_write ON erp_delegable_permissions FOR ALL
  USING (erp_is_platform_owner() OR erp_is_super_admin())
  WITH CHECK (erp_is_platform_owner() OR erp_is_super_admin());

-- Seed the OPERATIONAL allowlist (global defaults). Idempotent.
INSERT INTO erp_delegable_permissions (permission, company_id, enabled)
SELECT p, NULL, true FROM (VALUES
  ('customer.request'),
  ('stock_request.create'),
  ('cash.handover.request'),
  ('day.reopen.request'),
  ('returns.create'),
  ('sales.discount')
) AS s(p)
ON CONFLICT (COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid), permission) DO NOTHING;

-- DB belt: a permission is delegable iff it is in the (enabled) allowlist for the
-- company AND it is NOT in the immutable deny-list (platform/security/rls/
-- system-admin/treasury). Mirrors the code constant; enforced at the DB layer.
CREATE OR REPLACE FUNCTION erp_is_delegable_permission(p_perm text, p_company uuid)
RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM erp_delegable_permissions d
      WHERE d.permission = p_perm AND d.enabled
        AND (d.company_id IS NULL OR d.company_id = p_company)
    )
    AND p_perm NOT LIKE 'platform.%'
    AND p_perm NOT LIKE 'security.%'
    AND p_perm NOT LIKE 'rls.%'
    AND p_perm NOT LIKE 'treasury.%'
    AND p_perm NOT IN ('super.admin','integrations.manage','accounting.post','settings.users');
$$;
REVOKE ALL ON FUNCTION erp_is_delegable_permission(text, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION erp_is_delegable_permission(text, uuid) TO authenticated;

-- ── E1: tighten the write path on the override engine (defense in depth) ─────
-- Replace the single tenant FOR ALL policy with: tenant-scoped READ (unchanged
-- behavior) + admin-gated WRITE. For 'override' rows the write also requires the
-- permission to be delegable. Legacy writers (integration tests as table owner,
-- and the SECURITY DEFINER expiry sweep) bypass RLS, so they are unaffected.
DROP POLICY IF EXISTS erp_temp_access_tenant ON erp_temporary_access_grants;

CREATE POLICY erp_uao_select ON erp_temporary_access_grants FOR SELECT
  USING (erp_is_platform_owner() OR company_id = erp_user_company_id());

CREATE POLICY erp_uao_insert ON erp_temporary_access_grants FOR INSERT
  WITH CHECK (
    (erp_is_platform_owner() OR erp_is_super_admin()
      OR (company_id = erp_user_company_id() AND erp_is_company_admin(company_id)))
    AND (kind <> 'override' OR erp_is_delegable_permission(grant_key, company_id))
  );

CREATE POLICY erp_uao_update ON erp_temporary_access_grants FOR UPDATE
  USING (erp_is_platform_owner() OR erp_is_super_admin()
      OR (company_id = erp_user_company_id() AND erp_is_company_admin(company_id)))
  WITH CHECK (
    (erp_is_platform_owner() OR erp_is_super_admin()
      OR (company_id = erp_user_company_id() AND erp_is_company_admin(company_id)))
    AND (kind <> 'override' OR erp_is_delegable_permission(grant_key, company_id))
  );

CREATE POLICY erp_uao_delete ON erp_temporary_access_grants FOR DELETE
  USING (erp_is_platform_owner() OR erp_is_super_admin()
      OR (company_id = erp_user_company_id() AND erp_is_company_admin(company_id)));

-- Rollback (manual):
--   DROP POLICY erp_uao_select/insert/update/delete; recreate erp_temp_access_tenant;
--   DROP FUNCTION erp_is_delegable_permission; DROP TABLE erp_delegable_permissions;
--   ALTER TABLE ... DROP COLUMN effect, kind;  (windows can stay nullable)
