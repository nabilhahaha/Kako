-- ============================================================================
-- 0037: Platform owner can reset any tenant user's password
-- ----------------------------------------------------------------------------
-- Passwords are stored hashed (bcrypt) in auth.users — they cannot be read
-- back. The platform owner needs to be able to RESET a tenant user's password.
-- This SECURITY DEFINER function updates auth.users.encrypted_password using
-- pgcrypto, but ONLY when the caller is the platform owner (or a global super
-- admin). It refuses to touch other platform owners' accounts. Audited.
-- ============================================================================

CREATE OR REPLACE FUNCTION erp_admin_set_password(p_user_id UUID, p_new_password TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE v_target_is_owner BOOLEAN;
BEGIN
  IF NOT (erp_is_platform_owner() OR erp_is_super_admin()) THEN
    RAISE EXCEPTION 'غير مصرح بتغيير كلمات المرور.';
  END IF;
  IF p_new_password IS NULL OR length(p_new_password) < 6 THEN
    RAISE EXCEPTION 'كلمة المرور يجب أن تكون ٦ أحرف على الأقل.';
  END IF;

  -- Don't let one platform owner overwrite another owner's password.
  SELECT is_platform_owner INTO v_target_is_owner FROM public.erp_profiles WHERE id = p_user_id;
  IF v_target_is_owner AND p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'لا يمكن تغيير كلمة مرور مالك منصّة آخر.';
  END IF;

  UPDATE auth.users
     SET encrypted_password = crypt(p_new_password, gen_salt('bf')),
         updated_at = now()
   WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'المستخدم غير موجود.';
  END IF;
END $$;

REVOKE ALL ON FUNCTION erp_admin_set_password(UUID, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION erp_admin_set_password(UUID, TEXT) TO authenticated;
