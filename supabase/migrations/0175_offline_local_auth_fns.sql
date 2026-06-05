-- ============================================================================
-- 0175: Offline local auth — credential verification functions
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER helpers the OFFLINE auth service calls (service-role) to log
-- a user in and to set/reset a local password. The bcrypt comparison happens
-- inside the database so the password hash never leaves it.
--
-- Additive and offline-only: on the cloud build these functions exist but are
-- unused (the cloud uses Supabase Auth). They are granted to service_role only,
-- never to anon/authenticated, so they cannot be called from an RLS-scoped
-- client. Idempotent; safe to re-run.
-- ============================================================================

-- erp_local_login: verify email + password against erp_local_users and return
-- the identity + company binding the offline issuer needs to mint a JWT.
-- Returns no rows when the credentials are wrong or the account is inactive.
CREATE OR REPLACE FUNCTION erp_local_login(p_email TEXT, p_password TEXT)
RETURNS TABLE (user_id UUID, company_id UUID, email TEXT, full_name TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT lu.id, lu.company_id, lu.email, p.full_name
  FROM erp_local_users lu
  LEFT JOIN erp_profiles p ON p.id = lu.id
  WHERE lower(lu.email) = lower(p_email)
    AND lu.is_active
    AND lu.password_hash IS NOT NULL
    AND lu.password_hash = extensions.crypt(p_password, lu.password_hash);
$$;

-- erp_local_set_password: set/reset a local credential's bcrypt hash. Used by
-- the admin-reset flow (offline has no email-based reset).
CREATE OR REPLACE FUNCTION erp_local_set_password(p_user UUID, p_password TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  UPDATE erp_local_users
  SET password_hash = extensions.crypt(p_password, extensions.gen_salt('bf')),
      updated_at = now()
  WHERE id = p_user;
$$;

-- Lock down: callable only by service_role (the offline server's privileged
-- connection). Never anon/authenticated.
REVOKE ALL ON FUNCTION erp_local_login(TEXT, TEXT) FROM public;
REVOKE ALL ON FUNCTION erp_local_set_password(UUID, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION erp_local_login(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION erp_local_set_password(UUID, TEXT) TO service_role;
