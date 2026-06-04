-- ============================================================================
-- 0029: Prevent self-escalation of privileged profile columns
-- ----------------------------------------------------------------------------
-- The erp_profiles_update_self RLS policy (0006) lets a user update their own
-- profile row with WITH CHECK (id = auth.uid()) and NO column restriction, so
-- a user could PATCH their own is_super_admin / is_platform_owner / is_active
-- to true. Public self-registration (0028) makes this reachable by anyone, so
-- it is now a remote privilege-escalation path. This BEFORE UPDATE trigger
-- blocks changes to the privileged columns unless the current actor is already
-- a super admin (the legitimate admin path uses erp_profiles_admin_manage and
-- the service role, both of which satisfy erp_is_super_admin() / bypass RLS).
-- Defence in depth, independent of the RLS policy wording. Safe to re-run.
-- ============================================================================

CREATE OR REPLACE FUNCTION erp_guard_profile_privileges()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.is_super_admin   IS DISTINCT FROM OLD.is_super_admin)
  OR (NEW.is_platform_owner IS DISTINCT FROM OLD.is_platform_owner)
  OR (NEW.is_active        IS DISTINCT FROM OLD.is_active) THEN
    -- The service role (edge function / migrations) runs with bypassrls and
    -- a NULL auth.uid(); allow it. Otherwise require an existing super admin.
    IF auth.uid() IS NOT NULL AND NOT erp_is_super_admin() THEN
      RAISE EXCEPTION 'غير مصرح بتعديل صلاحيات الحساب.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS erp_profiles_guard_privileges ON erp_profiles;
CREATE TRIGGER erp_profiles_guard_privileges
  BEFORE UPDATE ON erp_profiles
  FOR EACH ROW EXECUTE FUNCTION erp_guard_profile_privileges();
