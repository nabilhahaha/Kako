-- ============================================================================
-- 0050: Tenant (company-admin) staff management
-- ----------------------------------------------------------------------------
-- Lets a COMPANY admin/manager manage their own staff (not just the platform
-- super admin): list members, change roles, activate/deactivate, reset
-- passwords — all strictly scoped to their own company and never touching a
-- privileged platform/super account. RLS already lets a branch member read
-- colleagues and manage their branch's assignments; these SECURITY DEFINER
-- helpers cover the two gaps (profile is_active + auth password). Safe to re-run.
-- ============================================================================

-- True when the caller is an admin/manager in the SAME company as the target,
-- and the target is an ordinary tenant user (not a super admin / platform owner).
CREATE OR REPLACE FUNCTION erp_can_manage_staff(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM erp_user_branches cub
      JOIN erp_branches cb ON cb.id = cub.branch_id
      WHERE cub.user_id = auth.uid()
        AND cub.role IN ('admin', 'manager')
        AND cb.company_id IN (
          SELECT tb.company_id
          FROM erp_user_branches tub
          JOIN erp_branches tb ON tb.id = tub.branch_id
          WHERE tub.user_id = p_user_id
        )
    )
    AND NOT EXISTS (
      SELECT 1 FROM erp_profiles tp
      WHERE tp.id = p_user_id
        AND (COALESCE(tp.is_super_admin, false) OR COALESCE(tp.is_platform_owner, false))
    );
$$;

-- The caller's company staff, one row per member (role from the default branch).
CREATE OR REPLACE FUNCTION erp_company_staff()
RETURNS TABLE (id UUID, full_name TEXT, email TEXT, is_active BOOLEAN, role TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT DISTINCT ON (p.id) p.id, p.full_name, p.email, p.is_active, ub.role
  FROM erp_profiles p
  JOIN erp_user_branches ub ON ub.user_id = p.id
  JOIN erp_branches b ON b.id = ub.branch_id
  WHERE b.company_id = erp_user_company_id()
    AND NOT COALESCE(p.is_platform_owner, false)
  ORDER BY p.id, ub.is_default DESC NULLS LAST;
$$;

-- Activate / deactivate a same-company member (cannot target self or a
-- privileged account).
CREATE OR REPLACE FUNCTION erp_set_staff_active(p_user_id UUID, p_active BOOLEAN)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'لا يمكنك تعديل حالة حسابك الخاص.';
  END IF;
  IF NOT (erp_is_super_admin() OR erp_can_manage_staff(p_user_id)) THEN
    RAISE EXCEPTION 'غير مصرح بإدارة هذا المستخدم.';
  END IF;
  UPDATE erp_profiles SET is_active = p_active WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'المستخدم غير موجود.'; END IF;
END $$;

-- Reset a same-company member's password (mirrors erp_admin_set_password but
-- scoped to a company admin/manager over their own ordinary staff).
CREATE OR REPLACE FUNCTION erp_set_staff_password(p_user_id UUID, p_new_password TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NOT (erp_is_super_admin() OR erp_can_manage_staff(p_user_id)) THEN
    RAISE EXCEPTION 'غير مصرح بتغيير كلمة المرور.';
  END IF;
  IF p_new_password IS NULL OR length(p_new_password) < 6 THEN
    RAISE EXCEPTION 'كلمة المرور يجب أن تكون ٦ أحرف على الأقل.';
  END IF;
  UPDATE auth.users
     SET encrypted_password = crypt(p_new_password, gen_salt('bf')),
         updated_at = now()
   WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'المستخدم غير موجود.'; END IF;
END $$;

REVOKE ALL ON FUNCTION erp_can_manage_staff(UUID) FROM public;
REVOKE ALL ON FUNCTION erp_company_staff() FROM public;
REVOKE ALL ON FUNCTION erp_set_staff_active(UUID, BOOLEAN) FROM public;
REVOKE ALL ON FUNCTION erp_set_staff_password(UUID, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION erp_can_manage_staff(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION erp_company_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION erp_set_staff_active(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION erp_set_staff_password(UUID, TEXT) TO authenticated;
